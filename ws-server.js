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

    // --- Usuario se une al archivo
    if (data.type === "join") {
      user = data.user;
      file = data.file;
      console.log(`${user} se ha unido al archivo ${file}`);

      if (!files[file]) {
        // Si es la primera vez, se guarda el contenido que manda el primer usuario
        files[file] = {
          content: data.content || "", // El contenido enviado desde el cliente (PHP)
          clients: new Set(),
          cursors: new Map()
        };
      }

      files[file].clients.add(ws);

      // Enviar contenido actual desde memoria
      ws.send(JSON.stringify({
        type: "content",
        content: files[file].content,
        file: file
      }));

      // Notificar a otros que alguien se unió
      broadcast(file, {
        type: "join",
        user: user,
        file: file
      }, ws);
    }

    // --- Actualización de contenido (editor)
    if (data.type === "content" && file) {
      files[file].content = data.content;

      broadcast(file, {
        type: "content",
        content: data.content,
        user: user,
        file: file
      }, ws);
    }

    // --- Movimiento de cursor
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

    // --- Selección de texto
    if (data.type === "selection" && file) {
      broadcast(file, {
        type: "selection",
        user: user,
        file: file,
        selection: data.selection
      }, ws);
    }

    // --- Guardar archivo en disco
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

      console.log(`${user} salió del archivo ${file}`);

      // Eliminar archivo de memoria si no queda nadie
      if (files[file].clients.size === 0) {
        delete files[file];
      }
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
