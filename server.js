// ---- server.js ----
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public'))); // serve index.html, stud.png, etc.

const GROUND_MIN = -25;
const GROUND_MAX = 24; // inclusive
const GROUND_Y = 0;

// ----- WORLD STATE -----
/**
 * We store blocks by key "x|y|z"
 * { x, y, z, color, indestructible }
 */
const blocks = new Map();
const players = new Map(); // id -> { x,y,z,yaw,name }

/** Key helper */
const keyOf = (x,y,z) => `${x}|${y}|${z}`;

/** Add a block to world (server-side). Returns true if new. */
function addBlock(x,y,z, color = 0xffffff, indestructible = false) {
  const k = keyOf(x,y,z);
  if (blocks.has(k)) return false;
  blocks.set(k, { x, y, z, color, indestructible });
  return true;
}

/** Remove a block if not indestructible */
function removeBlock(x,y,z) {
  const k = keyOf(x,y,z);
  const b = blocks.get(k);
  if (!b || b.indestructible) return false;
  blocks.delete(k);
  return true;
}

/** Build the indestructible ground platform once */
function buildGround() {
  for (let x = GROUND_MIN; x <= GROUND_MAX; x++) {
    for (let z = GROUND_MIN; z <= GROUND_MAX; z++) {
      addBlock(x, GROUND_Y, z, 0xffffff, true);
    }
  }
}
buildGround();



// ----- VALIDATION LIMITS -----
const MAX_BLOCKS_UPLOAD = 999999999;
const MIN_COORD = -512;
const MAX_COORD = 512;

// ----- SOCKET -----

let currentVote = null;

function startVote(socket, worldData) {
  if (currentVote) {
    socket.emit("vote-error", { message: "A vote is already in progress!" });
    return;
  }

  const totalPlayers = players.size;
  const needed = Math.ceil(totalPlayers / 2);

  currentVote = {
    initiator: socket.id,
    votes: new Map([[socket.id, true]]), // initiator automatically votes YES
    worldData,
    needed,
  };

  io.emit("vote-start", {
    initiator: players.get(socket.id)?.name || "Player",
    needed,
    yesCount: 1,
    totalPlayers,
  });

  checkVoteResult();
}

function castVote(socket, choice) {
  if (!currentVote) return;

  currentVote.votes.set(socket.id, choice);

  let activeVote = null;
  
  io.emit("vote-update", {
    voter: players.get(socket.id)?.name || "Player",
    yesCount: Array.from(currentVote.votes.values()).filter(v => v).length,
    noCount: Array.from(currentVote.votes.values()).filter(v => !v).length,
    needed: currentVote.needed,
  });

  checkVoteResult();
}

activeVote = {
  initiator: socket.id,
  yes: new Set(),
  no: new Set(),
  timer: setTimeout(() => {
    if (activeVote) {
      io.emit("vote-failed", { reason: "Time ran out" });
      activeVote = null;
    }
  }, 15000) // 15 seconds
}

function checkVoteResult() {
  if (!currentVote) return;
  const yesCount = Array.from(currentVote.votes.values()).filter(v => v).length;

  if (yesCount >= currentVote.needed) {
    applyWorldLoad(currentVote.worldData);
    io.emit("vote-success", { yesCount, needed: currentVote.needed });
    currentVote = null;
  }
}

io.on('connection', (socket) => {
  // Give initial snapshot
  socket.emit('init', {
    blocks: Array.from(blocks.values()),
    players: Object.fromEntries(players),
  });

   socket.on("chat", data => {
    // data: { name: "Player", text: "Hello" }
    io.emit("chat", data); // broadcast to everyone
   });

  socket.on('join', (p) => {
    players.set(socket.id, {
      x: p?.x ?? 0, y: p?.y ?? 2.5, z: p?.z ?? 0,
      yaw: p?.yaw ?? 0, name: p?.name ?? 'Player'
    });
    socket.broadcast.emit('player-join', { id: socket.id, ...players.get(socket.id) });
  });

  socket.on('move', (p) => {
    const me = players.get(socket.id);
    if (!me) return;
    if (typeof p.x === 'number') me.x = p.x;
    if (typeof p.y === 'number') me.y = p.y;
    if (typeof p.z === 'number') me.z = p.z;
    if (typeof p.yaw === 'number') me.yaw = p.yaw;
    if (typeof p.name === 'string') me.name = p.name.slice(0, 24);
    socket.broadcast.emit('player-update', { id: socket.id, ...me });
  });

  socket.on('name-change', ({ name }) => {
    const me = players.get(socket.id);
    if (!me) return;
    me.name = String(name || 'Player').slice(0, 24);
    socket.broadcast.emit('player-update', { id: socket.id, name: me.name });
  });

  // Build/remove from clients (server validates + rebroadcasts)
  socket.on('build', ({ x, y, z, color }) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (x < MIN_COORD || x > MAX_COORD || y < MIN_COORD || y > MAX_COORD || z < MIN_COORD || z > MAX_COORD) return;
    const safeColor = (typeof color === 'number' && color >= 0 && color <= 0xffffff) ? color : 0xffffff;
    if (addBlock(x, y, z, safeColor, false)) {
      io.emit('build', { x, y, z, color: safeColor });
    }
  });

  socket.on('remove', ({ x, y, z }) => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (removeBlock(x, y, z)) {
      io.emit('remove', { x, y, z });
    }
  });
  
  // ----- SAVE (client asks, server sends full world) -----
  socket.on('request-save', () => {
    // Send all blocks (client decides to skip ground when saving if desired)
    socket.emit('world-data', { blocks: Array.from(blocks.values()) });
  });

  // ----- LOAD (client uploads a file; server validates & applies) -----
  socket.on('load-world', (payload) => {
    try {
      if (!payload || !Array.isArray(payload.blocks)) return;
      if (payload.blocks.length > MAX_BLOCKS_UPLOAD) return;

      startVote(socket, payload); // <-- initiate vote instead of loading immediately
    } catch (e) {
      console.error('load-world error:', e);
    }
  });

socket.on("vote", ({ choice }) => {
  if (typeof choice !== "boolean") return;
  castVote(socket, choice);
});


  socket.on('disconnect', () => {
    if (players.has(socket.id)) {
      socket.broadcast.emit('player-leave', { id: socket.id });
      players.delete(socket.id);
    }
  });
});

function applyWorldLoad(payload) {
  const incoming = payload.blocks;

  // 1) keep ground, 2) clear everything else
  for (const [k, b] of blocks) {
    if (!b.indestructible) blocks.delete(k);
  }

  let added = 0;
  for (const raw of incoming) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y) || !Number.isFinite(raw.z)) continue;

    const x = Math.round(raw.x);
    const y = Math.round(raw.y);
    const z = Math.round(raw.z);
    if (x < MIN_COORD || x > MAX_COORD || y < MIN_COORD || y > MAX_COORD || z < MIN_COORD || z > MAX_COORD) continue;

    const color = (typeof raw.color === 'number' && raw.color >= 0 && raw.color <= 0xffffff) ? raw.color : 0xffffff;

    const k = keyOf(x, y, z);
    if (blocks.has(k) && blocks.get(k).indestructible) continue;

    if (addBlock(x, y, z, color, false)) added++;
  }

  io.emit('world-set', { blocks: Array.from(blocks.values()) });
  console.log(`World loaded: ${added} blocks (excluding ground).`);
}

const PORT = process.env.PORT || 80;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));




