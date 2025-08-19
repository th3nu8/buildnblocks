const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public')) // serve index.html, stud.png, etc.

const blocks = [] // store blocks as {x, y, z, color}
const players = {} // id -> player info

io.on('connection', (socket) => {
  console.log(socket.id, 'connected')

  // Send initial state
  socket.emit('init', {
    blocks,
    players
  })

  // Join
  socket.on('join', (data) => {
    players[socket.id] = data
    socket.broadcast.emit('player-join', {id: socket.id, ...data})
  })

  // Move
  socket.on('move', (data) => {
    if(players[socket.id]){
      players[socket.id] = {...players[socket.id], ...data}
      socket.broadcast.emit('player-update', {id: socket.id, ...data})
    }
  })

  // Build
  socket.on('build', (data) => {
    blocks.push(data)
    io.emit('build', data)
  })

  // Remove
  socket.on('remove', (data) => {
    const index = blocks.findIndex(b => b.x === data.x && b.y === (data.y - .25) && b.z === data.z)
    if(index !== -1) blocks.splice(index, 1)
    io.emit('remove', data)
  })

  // Name change
  socket.on('name-change', ({name}) => {
    if(players[socket.id]){
      players[socket.id].name = name
      io.emit('player-update', {id: socket.id, name})
    }
  })

  socket.on('disconnect', () => {
    delete players[socket.id]
    io.emit('player-leave', {id: socket.id})
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log('Server running on port', PORT))

