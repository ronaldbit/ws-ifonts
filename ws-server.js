const WebSocket = require("ws");
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = new Map(); // cliente -> { username, file }
let filesData = new Map(); // fileName -> latest content

server.on("connection", (ws) => {
  let username = null;
  let file = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        username = data.user;
        file = data.file;

        clients.set(ws, { username, file });

        // Envía el contenido actual si hay
        if (filesData.has(file)) {
          ws.send(JSON.stringify({
            type: "content",
            content: filesData.get(file),
            user: "servidor"
          }));
        } else {
          filesData.set(file, ""); // inicializa vacío si no hay
        }

        broadcast(file, {
          type: "notice",
          text: `${username} se unió a "${file}"`,
        }, ws);
      }

      if (data.type === "cursor") {
        broadcast(data.file, {
          type: "cursor",
          cursor: data.cursor,
          user: username,
          file: data.file
        }, ws);
      }

      if (data.type === "content") {
        filesData.set(data.file, data.content); // guarda contenido en memoria
        broadcast(data.file, {
          type: "content",
          content: data.content,
          user: username,
          file: data.file
        }, ws);
      }

      if (data.type === "save") {
        require("fs").writeFile(data.file, data.content, (err) => {
          if (err) {
            console.error("Error al guardar archivo:", err);
            return;
          }
          broadcast(data.file, {
            type: "saved",
            user: username,
            file: data.file
          });
        });
      }

    } catch (e) {
      console.error("Error procesando mensaje:", e);
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    clients.delete(ws);
    if (info?.username && info?.file) {
      broadcast(info.file, {
        type: "notice",
        text: `${info.username} salió de "${info.file}"`,
      });
    }
  });
});

function broadcast(file, data, except = null) {
  const msg = JSON.stringify(data);
  for (let [client, info] of clients.entries()) {
    if (info.file === file && client.readyState === WebSocket.OPEN && client !== except) {
      client.send(msg);
    }
  }
}

console.log("Servidor WebSocket corriendo en el puerto 8080");
