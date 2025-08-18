const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public')); // serve index.html, stud.png, etc.

const USERS_FILE = path.join(__dirname, 'users.json');

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function generateId() {
    return 'p_' + Math.random().toString(36).substr(2, 9);
}

// ----------------- AUTH ENDPOINTS -----------------
app.post('/signup', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const users = loadUsers();
    if (users[email]) return res.status(400).json({ error: 'Email already exists' });

    const hash = await bcrypt.hash(password, 10);
    const id = generateId();
    users[email] = { password: hash, id };
    saveUsers(users);
    res.json({ success: true, id });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    if (!users[email]) return res.status(400).json({ error: 'Email not found' });

    const valid = await bcrypt.compare(password, users[email].password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });

    res.json({ success: true, id: users[email].id });
});

// ----------------- SOCKET.IO -----------------
const players = {}; // playerId -> {x,y,z,yaw,name}

io.on('connection', socket => {
    let playerId = null;

    socket.on('auth', (data) => {
        playerId = data.id;
        players[playerId] = { x:0, y:2.5, z:0, yaw:0, name: data.name || 'Player' };
        // send initial state
        socket.emit('init', { blocks: [], players });
        socket.broadcast.emit('player-join', { id: playerId, x:0, y:2.5, z:0, name: players[playerId].name });
    });

    socket.on('move', (data) => {
        if (!playerId) return;
        players[playerId] = { ...players[playerId], ...data };
        socket.broadcast.emit('player-update', { id: playerId, ...data });
    });

    socket.on('build', (data) => {
        if (!playerId) return;
        io.emit('build', data);
    });

    socket.on('remove', (data) => {
        if (!playerId) return;
        io.emit('remove', data);
    });

    socket.on('name-change', (data) => {
        if (!playerId) return;
        players[playerId].name = data.name;
        socket.broadcast.emit('player-update', { id: playerId, name: data.name });
    });

    socket.on('disconnect', () => {
        if (!playerId) return;
        delete players[playerId];
        socket.broadcast.emit('player-leave', { id: playerId });
    });
});

// ----------------- START SERVER -----------------
server.listen(3000, () => console.log('Server running on http://localhost:3000'));
