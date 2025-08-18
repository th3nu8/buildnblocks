const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Serve static files (index.html, textures, client scripts)
app.use(express.static(__dirname + '/'));

// Track connected players
const players = {}; // playerId -> {x, y, z, yaw, name}

// Track built blocks (optional for new players joining)
const blocks = []; // each block: {x, y, z, color}

// Socket.IO events
io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  // Player joins
  socket.on('join', data => {
    players[socket.id] = data;

    // Send current world state to the new player
    socket.emit('init', {
      blocks: blocks,
      players
    });
  });

  // Player movement
  socket.on('move', data => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...data };
      socket.broadcast.emit('player-update', { id: socket.id, ...data });
    }
  });

  // Build a block
  socket.on('build', data => {
    // data = {x, y, z, color}
    blocks.push(data);           // store block
    socket.broadcast.emit('build', data); // notify others
  });

  // Remove a block
  socket.on('remove', data => {
    // Remove block from server list
    const index = blocks.findIndex(b => b.x === data.x && b.y === data.y && b.z === data.z);
    if (index !== -1) blocks.splice(index, 1);

    socket.broadcast.emit('remove', data);
  });

  // Name change
  socket.on('name-change', data => {
    if (players[socket.id]) players[socket.id].name = data.name;
    socket.broadcast.emit('player-update', { id: socket.id, name: data.name });
  });

  // Player disconnects
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('player-leave', { id: socket.id });
  });
});

// Start server
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
