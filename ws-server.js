// === ws-server.js ===

const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 3000 });

const clients = new Map(); // ws -> { username, file }
const filesData = {}; // file -> content
const cursors = {}; // file -> { user -> { position } }

function broadcast(file, message, exclude = null) {
  for (const [client, meta] of clients.entries()) {
    if (meta.file === file && client.readyState === WebSocket.OPEN && client !== exclude) {
      client.send(JSON.stringify(message));
    }
  }
}

server.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error("Invalid JSON", e);
      return;
    }

    const { type, user, file } = data;

    if (type === 'join') {
      clients.set(ws, { username: user, file });
      if (!filesData[file]) filesData[file] = '';
      if (!cursors[file]) cursors[file] = {};

      ws.send(JSON.stringify({ type: 'content', content: filesData[file] }));

      broadcast(file, {
        type: 'notice',
        text: `${user} se unió al archivo`,
        user
      }, ws);
    }

    if (type === 'edit') {
      broadcast(file, {
        type: 'edit',
        changes: data.changes,
        user,
        file
      }, ws);
    }

    if (type === 'cursor') {
      cursors[file][user] = data.position;
      broadcast(file, {
        type: 'cursor',
        user,
        position: data.position
      }, ws);
    }

    if (type === 'save') {
      filesData[file] = data.content;
      console.log(`Archivo ${file} guardado.`);
    }
  });

  ws.on('close', () => {
    const meta = clients.get(ws);
    if (meta) {
      const { username, file } = meta;
      delete cursors[file]?.[username];
      broadcast(file, {
        type: 'removeCursor',
        user: username
      });
      clients.delete(ws);
    }
  });
});
