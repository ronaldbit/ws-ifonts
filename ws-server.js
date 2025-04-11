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

        // Asociar cliente con archivo
        clients.set(ws, { username, file });

        // Si el archivo ya tiene contenido, enviar al nuevo cliente
        if (filesData.has(file)) {
          ws.send(JSON.stringify({
            type: "content",
            content: filesData.get(file),
            user: "servidor"
          }));
        } else {
          filesData.set(file, ""); // Si no existe, crear contenido vacío
        }

        // Broadcast para notificar a otros clientes sobre la unión
        broadcast(file, {
          type: "notice",
          text: `${username} se unió a "${file}"`,
        }, ws);
      }

      if (data.type === "cursor") {
        broadcast(file, {
          type: "cursor",
          cursor: data.cursor,
          user: username,
          file: data.file
        }, ws);
      }

      if (data.type === "content") {
        // Guardar el contenido del archivo
        filesData.set(data.file, data.content);

        // Broadcast para enviar el nuevo contenido a otros usuarios en el mismo archivo
        broadcast(file, {
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
          broadcast(file, {
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

// Enviar mensaje a todos los clientes que estén en el mismo archivo
function broadcast(file, data, except = null) {
  const msg = JSON.stringify(data);
  for (let [client, info] of clients.entries()) {
    if (info.file === file && client.readyState === WebSocket.OPEN && client !== except) {
      client.send(msg);
    }
  }
}

console.log("Servidor WebSocket corriendo en el puerto 8080");
