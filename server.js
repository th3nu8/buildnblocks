const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" folder
app.use(express.static('public'));

// Fallback route for root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// In-memory storage for blocks and players
let blocks = [];
let players = {};

// Socket.io events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send initial state
  socket.emit('init', { blocks, players });

  // Handle player movement updates
  socket.on('move', (data) => {
    players[socket.id] = data;
    socket.broadcast.emit('player-update', { id: socket.id, ...data });
  });

  // Handle name change
  socket.on('name-change', ({ name }) => {
    if (players[socket.id]) players[socket.id].name = name;
    socket.broadcast.emit('player-update', { id: socket.id, name });
  });

  // Handle building blocks
  socket.on('build', (block) => {
    blocks.push(block);
    io.emit('build', block); // broadcast to everyone
  });

  // Handle removing blocks
  socket.on('remove', (block) => {
    blocks = blocks.filter(b => !(b.x === block.x && b.y === block.y && b.z === block.z));
    io.emit('remove', block);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('player-leave', { id: socket.id });
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
