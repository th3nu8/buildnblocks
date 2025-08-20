const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const fs = require('fs')  // <-- for saving/loading

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static('public')) // serve index.html, stud.png, etc.

const blocks = [] // store blocks as {x, y, z, color}
const players = {} // id -> player info

// Load saved world if exists
try {
  const data = fs.readFileSync('world.json', 'utf8')
  const savedBlocks = JSON.parse(data)
  blocks.push(...savedBlocks)
  console.log('Loaded saved world with', blocks.length, 'blocks')
} catch(e) {
  console.log('No saved world found, starting fresh.')
}

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
    const index = blocks.findIndex(b => b.x === data.x && b.y === data.y && b.z === data.z)
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

  // --- SAVE & LOAD EVENTS ---
  socket.on('save-world', () => {
    try {
      fs.writeFileSync('world.json', JSON.stringify(blocks, null, 2))
      socket.emit('world-saved')
      console.log('World saved by', socket.id)
    } catch(e){
      socket.emit('error', 'Failed to save world')
      console.error(e)
    }
  })

  socket.on('load-world', () => {
    try {
      const data = fs.readFileSync('world.json', 'utf8')
      const savedBlocks = JSON.parse(data)

      // Replace current blocks
      blocks.length = 0
      blocks.push(...savedBlocks)

      io.emit('world-loaded', blocks)
      console.log('World loaded by', socket.id)
    } catch(e){
      socket.emit('error', 'No saved world found.')
    }
  })

  socket.on('disconnect', () => {
    delete players[socket.id]
    io.emit('player-leave', {id: socket.id})
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log('Server running on port', PORT))
