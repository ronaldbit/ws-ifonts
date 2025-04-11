const WebSocket = require("ws");
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let rooms = {};  // Almacena las salas (archivo -> usuarios)
let filesData = new Map();  // Almacena el contenido de los archivos

server.on("connection", (ws) => {
  let user = null;
  let room = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        user = data.user;  // Obtén el usuario desde la sesión PHP
        room = data.file;

        // Si la sala no existe, la creamos
        if (!rooms[room]) {
          rooms[room] = [];
        }

        // Añadimos el usuario a la sala
        rooms[room].push(ws);

        // Enviar el contenido actual del archivo al usuario
        if (filesData.has(room)) {
          ws.send(JSON.stringify({
            type: "content",
            content: filesData.get(room),
            user: "servidor"
          }));
        } else {
          filesData.set(room, "");
        }

        // Notificar a los demás usuarios de la sala que alguien se ha unido
        broadcast(room, {
          type: "notice",
          text: `${user} se unió a "${room}"`,
        }, ws);
      }

      if (data.type === "content") {
        filesData.set(room, data.content);

        // Enviar el nuevo contenido a todos los usuarios en la sala
        broadcast(room, {
          type: "content",
          content: data.content,
          user: user,
          file: room
        }, ws);
      }

      if (data.type === "save") {
        // Lógica para guardar el archivo en el servidor, si se activa la opción
        require("fs").writeFile(data.file, data.content, (err) => {
          if (err) {
            console.error("Error al guardar archivo:", err);
            return;
          }
          broadcast(room, {
            type: "saved",
            user: user,
            file: data.file
          });
        });
      }

    } catch (e) {
      console.error("Error procesando mensaje:", e);
    }
  });

  ws.on("close", () => {
    if (room && user) {
      // Eliminar el usuario de la sala
      rooms[room] = rooms[room].filter(client => client !== ws);
      broadcast(room, {
        type: "notice",
        text: `${user} salió de "${room}"`,
      });
    }
  });
});

// Función para enviar mensajes a todos los clientes de la sala
function broadcast(room, data, except = null) {
  const msg = JSON.stringify(data);
  if (rooms[room]) {
    rooms[room].forEach(client => {
      if (client.readyState === WebSocket.OPEN && client !== except) {
        client.send(msg);
      }
    });
  }
}

console.log("Servidor WebSocket corriendo en el puerto 8080");
