const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // serve your index.html and assets

// ---------- GAME STATE ----------
const blocks = []; // array of {x,y,z}
const players = {}; // key: socket.id, value: {x,y,z,yaw,name}

// ---------- SOCKET.IO ----------
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Send initial state
  socket.emit('init', { blocks, players });

  // When a new player joins, add them and notify everyone else
  socket.on('join', (data) => {
    players[socket.id] = data;
    socket.broadcast.emit('player-join', { id: socket.id, ...data });
  });

  // Movement updates
  socket.on('move', (data) => {
    if (!players[socket.id]) return;
    players[socket.id] = { ...players[socket.id], ...data };
    socket.broadcast.emit('player-update', { id: socket.id, ...data });
  });

  // Build block
  socket.on('build', (data) => {
    if (!blocks.find(b => b.x === data.x && b.y === data.y && b.z === data.z)) {
      blocks.push(data);
      io.emit('build', data); // broadcast to everyone
    }
  });

  // Remove block
  socket.on('remove', (data) => {
    const index = blocks.findIndex(b => b.x === data.x && b.y === data.y && b.z === data.z);
    if (index !== -1) {
      blocks.splice(index, 1);
      io.emit('remove', data);
    }
  });
  socket.on("colorBlock", (data) => {
    io.emit("colorBlock", data);
  });

  // Name change
  socket.on('name-change', ({ name }) => {
    if (players[socket.id]) {
      players[socket.id].name = name;
      socket.broadcast.emit('player-update', { id: socket.id, name });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    socket.broadcast.emit('player-leave', { id: socket.id });
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

