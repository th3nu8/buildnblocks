// server.js
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Serve the Public folder
app.use(express.static(__dirname + '/Public'));

// Serve index.html explicitly
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/Public/index.html');
});

// ---- GAME STATE ----
const blocks = new Map(); // key: "x|y|z" -> { x, y, z }
const players = {};       // playerId -> { x, y, z, name }

// Helper to get key from coordinates
function keyOf(x, y, z) {
    return `${x}|${y}|${z}`;
}

// ---- SOCKET.IO ----
io.on('connection', socket => {
    console.log(`Player connected: ${socket.id}`);

    // Send current blocks & players to the new client
    socket.emit('init', {
        blocks: Array.from(blocks.values()),
        players
    });

    // When a player joins
    socket.on('join', data => {
        players[socket.id] = { x: data.x, y: data.y, z: data.z, name: data.name };
        socket.broadcast.emit('player-join', { id: socket.id, ...players[socket.id] });
    });

    // When a player moves
    socket.on('move', data => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...data };
            socket.broadcast.emit('player-update', { id: socket.id, ...data });
        }
    });

    // When a block is built
    socket.on('build', data => {
        const k = keyOf(data.x, data.y, data.z);
        if (!blocks.has(k)) {
            blocks.set(k, { x: data.x, y: data.y, z: data.z, color: data.color || 0x00ff00 });
            io.emit('build', blocks.get(k)); // broadcast to all
        }
    });

    // When a block is removed
    socket.on('remove', data => {
        const k = keyOf(data.x, data.y, data.z);
        if (blocks.has(k)) {
            blocks.delete(k);
            io.emit('remove', data);
        }
    });

    // When player changes name
    socket.on('name-change', data => {
        if (players[socket.id]) {
            players[socket.id].name = data.name;
            socket.broadcast.emit('player-update', { id: socket.id, name: data.name });
        }
    });

    // When player disconnects
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        socket.broadcast.emit('player-leave', { id: socket.id });
    });
});

// ---- START SERVER ----
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
