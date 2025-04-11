// ws-server.js
const WebSocket = require("ws");
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = new Map();

server.on("connection", (ws) => {
  let username = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        username = data.username;
        clients.set(ws, username);
        broadcast({
          type: "notice",
          text: `${username} se unió al archivo`,
        });
      }

      if (data.type === "cursor") {
        broadcast({
          type: "cursor",
          username,
          x: data.x,
          y: data.y,
        }, ws); // no lo reenvía a sí mismo
      }
    } catch (e) {
      console.error("Error al procesar mensaje:", e);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    if (username) {
      broadcast({
        type: "notice",
        text: `${username} salió`,
      });
    }
  });
});

function broadcast(data, except = null) {
  const msg = JSON.stringify(data);
  for (let [client, name] of clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(msg);
    }
  }
}

console.log("Servidor WebSocket corriendo en el puerto 8080");
