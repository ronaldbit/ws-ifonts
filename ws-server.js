const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

let rooms = {}; // { fileName: { users: Set, content: '...', cursors: {} } }

wss.on('connection', (ws) => {
  let user = null;
  let file = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'join') {
        user = data.user;
        file = data.file;

        if (!rooms[file]) {
          rooms[file] = { users: new Set(), content: '', cursors: {} };
        }

        rooms[file].users.add(ws);
        console.log(`👤 ${user} se unió a la sala: ${file}`);

        // Enviar contenido actual a quien se conecta
        ws.send(JSON.stringify({ type: 'content', content: rooms[file].content, user: 'server' }));

        // Notificar a otros que se unió
        broadcast(file, { type: 'join', user }, ws);
      }

      if (data.type === 'content') {
        if (rooms[file]) {
          rooms[file].content = data.content;
          broadcast(file, data, ws); // Reenviar a todos excepto a quien lo envió
        }
      }

      if (data.type === 'cursor') {
        if (rooms[file]) {
          rooms[file].cursors[data.user] = data.position;
          broadcast(file, data, ws); // Enviar posición del cursor
        }
      }

      if (data.type === 'save') {
        // Aquí podrías guardar en archivo si deseas
        console.log(`💾 ${user} quiere guardar ${file}`);
      }

    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message);
    }
  });

  ws.on('close', () => {
    if (rooms[file]) {
      rooms[file].users.delete(ws);
      delete rooms[file].cursors?.[user];

      // Notificar a otros que salió
      broadcast(file, { type: 'leave', user });

      console.log(`❌ ${user} salió de la sala: ${file}`);

      // Eliminar sala si ya no hay nadie
      if (rooms[file].users.size === 0) {
        delete rooms[file];
      }
    }
  });
});

function broadcast(file, data, exclude = null) {
  if (!rooms[file]) return;
  const message = JSON.stringify(data);
  rooms[file].users.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
