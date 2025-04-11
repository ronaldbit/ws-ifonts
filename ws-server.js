// ws-server.js
const WebSocket = require("ws");
const fs = require("fs");
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = new Map(); // Map<ws, { username, file }>
let contentCache = {};    // { [fileName]: "contenido actual" }

server.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        clients.set(ws, { username: data.user, file: data.file });

        if (!contentCache[data.file]) {
          contentCache[data.file] = fs.existsSync(data.file)
            ? fs.readFileSync(data.file, "utf8")
            : "";
        }

        ws.send(JSON.stringify({
          type: "initial",
          content: contentCache[data.file],
          file: data.file
        }));

        broadcast({
          type: "notice",
          text: `${data.user} se unió al archivo ${data.file}`
        }, ws);
      }

      if (data.type === "cursor") {
        const { user, file, cursor } = data;
        broadcast({
          type: "cursor",
          user,
          file,
          cursor
        }, ws);
      }

      if (data.type === "content") {
        contentCache[data.file] = data.content;
        broadcast({
          type: "content",
          user: data.user,
          file: data.file,
          content: data.content
        }, ws);
      }

      if (data.type === "save") {
        fs.writeFile(data.file, data.content, (err) => {
          if (err) {
            ws.send(JSON.stringify({ type: "error", message: "Error al guardar archivo." }));
          } else {
            ws.send(JSON.stringify({ type: "saved", file: data.file }));
          }
        });
      }

    } catch (e) {
      console.error("Error al procesar mensaje:", e);
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    clients.delete(ws);
    if (info && info.username) {
      broadcast({
        type: "notice",
        text: `${info.username} salió del archivo`
      });
    }
  });
});

function broadcast(data, except = null) {
  const msg = JSON.stringify(data);
  for (let [client] of clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(msg);
    }
  }
}

console.log("Servidor WebSocket corriendo en el puerto 8080");
