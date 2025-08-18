const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('Public'));

const blocks = [];
const players = {};

io.on('connection', socket => {
    console.log('Player connected:', socket.id);
    
    // Send initial data
    socket.emit('init', { blocks, players });

    // New player
    players[socket.id] = { x:0, y:2.5, z:0, yaw:0, name:"Player" };
    io.emit('player-join', { id: socket.id, ...players[socket.id] });

    // Move
    socket.on('move', data => {
        if(players[socket.id]){
            players[socket.id] = { ...players[socket.id], ...data };
            socket.broadcast.emit('player-update', { id: socket.id, ...data });
        }
    });

    // Name change
    socket.on('name-change', data => {
        if(players[socket.id]){
            players[socket.id].name = data.name;
            io.emit('player-update', { id: socket.id, name: data.name });
        }
    });

    // Build
    socket.on('build', ({x,y,z}) => {
        const key = `${x}|${y}|${z}`;
        if(!blocks.find(b => b.key === key)){
            const b = { x, y, z, key };
            blocks.push(b);
            io.emit('build', { x, y, z });
        }
    });

    // Remove
    socket.on('remove', ({x,y,z}) => {
        const key = `${x}|${y}|${z}`;
        const index = blocks.findIndex(b => b.key === key);
        if(index !== -1){
            blocks.splice(index, 1);
            io.emit('remove', { x, y, z });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('player-leave', { id: socket.id });
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
