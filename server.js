// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the Public folder
app.use(express.static(path.join(__dirname, 'Public')));

// Store block data: {x|y|z: {x, y, z, color}}
const blocks = {};

// Handle socket connections
io.on('connection', socket => {
  console.log('A user connected:', socket.id);

  // Send current blocks to new player
  socket.emit('init', { blocks: Object.values(blocks) });

  // When a player builds a block
  socket.on('build', data => {
    const key = `${data.x}|${data.y}|${data.z}`;
    blocks[key] = { x: data.x, y: data.y, z: data.z, color: data.color || 0xffffff };
    io.emit('build', blocks[key]);
  });

  // When a player removes a block
  socket.on('remove', data => {
    const key = `${data.x}|${data.y}|${data.z}`;
    delete blocks[key];
    io.emit('remove', { x: data.x, y: data.y, z: data.z });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
