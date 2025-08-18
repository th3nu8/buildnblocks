// server.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.json());
app.use(express.static('public')); // serves index.html and assets

// ---------- ACCOUNT MANAGEMENT ----------
const accountsFile = path.join(__dirname, 'players.json');
let accounts = {}; // stores registered accounts: email -> { password, id }

if (fs.existsSync(accountsFile)) {
    accounts = JSON.parse(fs.readFileSync(accountsFile));
}

// Signup route
app.post('/signup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Missing email or password' });

    if (accounts[email]) return res.json({ success: false, message: 'Email already registered' });

    const hashed = bcrypt.hashSync(password, 10);
    const playerId = uuidv4();
    accounts[email] = { password: hashed, id: playerId };

    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
    res.json({ success: true, id: playerId });
});

// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Missing email or password' });

    const account = accounts[email];
    if (!account) return res.json({ success: false, message: 'Email not registered' });
    if (!bcrypt.compareSync(password, account.password)) return res.json({ success: false, message: 'Wrong password' });

    res.json({ success: true, id: account.id });
});

// ---------- MULTIPLAYER ----------
const blocks = []; // All blocks in the world
const blockIndex = new Map();
const indestructibleBlocks = new Set();
const players = {}; // currently connected players: socketId -> { x,y,z,yaw,name }

function keyOf(x, y, z) {
    return `${x}|${y}|${z}`;
}

function makeBlock(x, y, z, indestructible = false) {
    const k = keyOf(x, y, z);
    if (blockIndex.has(k)) return;
    const block = { x, y, z };
    blocks.push(block);
    blockIndex.set(k, block);
    if (indestructible) indestructibleBlocks.add(k);
}

function removeBlock(x, y, z) {
    const k = keyOf(x, y, z);
    if (!blockIndex.has(k) || indestructibleBlocks.has(k)) return false;
    blockIndex.delete(k);
    const idx = blocks.findIndex(b => b.x === x && b.y === y && b.z === z);
    if (idx !== -1) blocks.splice(idx, 1);
    return true;
}

// create initial ground
for (let x = -25; x < 25; x++) for (let z = -25; z < 25; z++) makeBlock(x, 0, z, true);

// ---------- SOCKET.IO ----------
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Send current world state
    socket.emit('init', { blocks, players });

    // Player join
    socket.on('join', (data) => {
        players[socket.id] = {
            x: data.x || 0,
            y: data.y || 2.5,
            z: data.z || 0,
            yaw: data.yaw || 0,
            name: data.name || 'Player'
        };
        socket.broadcast.emit('player-join', { id: socket.id, ...players[socket.id] });
    });

    // Move/update
    socket.on('move', (data) => {
        if (!players[socket.id]) return;
        Object.assign(players[socket.id], data);
        socket.broadcast.emit('player-update', { id: socket.id, ...data });
    });

    // Build
    socket.on('build', (data) => {
        makeBlock(data.x, data.y, data.z);
        socket.broadcast.emit('build', data);
    });

    // Remove
    socket.on('remove', (data) => {
        if (removeBlock(data.x, data.y, data.z)) socket.broadcast.emit('remove', data);
    });

    // Name change
    socket.on('name-change', ({ name }) => {
        if (!players[socket.id]) return;
        players[socket.id].name = name;
        socket.broadcast.emit('player-update', { id: socket.id, name });
    });

    // Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        socket.broadcast.emit('player-leave', { id: socket.id });
        console.log('Player disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
