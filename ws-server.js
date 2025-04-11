const WebSocket = require("ws");
const fs = require("fs");

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const files = {}; // { fileName: { content: string, clients: Set<WebSocket>, cursors: Map<user, {line, col}>, history: Set<user> } }
const wsUserMap = new Map(); // ws -> { user, file }

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

      wsUserMap.set(ws, { user, file });

      if (!files[file]) {
        files[file] = {
          content: data.content || "",
          clients: new Set(),
          cursors: new Map(),
          history: new Set()
        };
      }

      files[file].clients.add(ws);
      files[file].history.add(user);

      // Enviar contenido actual desde memoria
      ws.send(JSON.stringify({
        type: "content",
        content: files[file].content,
        file: file,
        editors: getEditors(file),
        history: Array.from(files[file].history),
        active: getEditors(file),
        inactive: getInactiveUsers(file)
      }));

      // Notificar a otros que alguien se unió
      broadcast(file, {
        type: "join",
        user: user,
        file: file,
        editors: getEditors(file),
        inactive: getInactiveUsers(file)
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
      wsUserMap.delete(ws);

      // Notificar a otros sobre salida
      broadcast(file, {
        type: "leave",
        user: user,
        file: file,
        editors: getEditors(file),
        inactive: getInactiveUsers(file)
      });

      if (files[file].clients.size === 0) {
        delete files[file];
      }
    }
  });
});

// --- Funciones auxiliares

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

function getEditors(file) {
  const fileData = files[file];
  if (!fileData) return [];
  const editors = [];

  for (const client of fileData.clients) {
    const data = wsUserMap.get(client);
    if (data && data.file === file) {
      editors.push(data.user);
    }
  }

  return editors;
}

function getInactiveUsers(file) {
  const fileData = files[file];
  if (!fileData) return [];
  const activeUsers = new Set(getEditors(file));
  const allUsers = fileData.history;
  const inactive = Array.from(allUsers).filter(user => !activeUsers.has(user));
  return inactive;
}
