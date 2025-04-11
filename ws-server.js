const WebSocket = require("ws");
const fs = require("fs");

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const files = {}; // { fileName: { content: string, clients: Set<WebSocket>, cursors: Map<user, {line, col}> } }

wss.on("connection", (ws) => {
  let user = null;
  let file = null;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    if (data.type === "join") {
      user = data.user;
      file = data.file;
      console.log(`${user} se ha unido al archivo ${file}`);

      if (!files[file]) {
        files[file] = {
          content: "",
          clients: new Set(),
          cursors: new Map()
        };
      }

      files[file].clients.add(ws);
      ws.send(JSON.stringify({ type: "content", content: files[file].content, file }));

      broadcast(file, {
        type: "join",
        user: user,
        file: file
      }, ws);
    }

    if (data.type === "content" && file) {
      files[file].content = data.content;
      broadcast(file, {
        type: "content",
        content: data.content,
        user: user,
        file: file
      }, ws);
    }

    if (data.type === "cursor" && file) {
      files[file].cursors.set(user, data.cursor);
      console.log(`Cursor de ${user} en ${file}: Línea ${data.cursor.lineNumber}, Columna ${data.cursor.column}`);
      broadcast(file, {
        type: "cursor",
        user: user,
        file: file,
        cursor: data.cursor
      }, ws);
    }

    if (data.type === "save" && file) {
      fs.writeFile(file, data.content, (err) => {
        if (err) {
          console.error(`Error guardando ${file}:`, err);
        } else {
          console.log(`${user} guardó ${file}`);
        }
      });
    }
  });

  ws.on("close", () => {
    if (file && files[file]) {
      files[file].clients.delete(ws);
      files[file].cursors.delete(user);
      broadcast(file, {
        type: "leave",
        user: user,
        file: file
      });
      console.log(` ${user} salió del archivo ${file}`);
    }
  });
});

function broadcast(file, message, exclude = null) {
  const fileData = files[file];
  if (!fileData) return;

  const json = JSON.stringify(message);
  for (const client of fileData.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}
