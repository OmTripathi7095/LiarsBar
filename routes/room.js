const express = require('express');
const router  = express.Router();
const Room    = require('../models/room');
const Player  = require('../models/player');

async function genUniqueCode() {
  let code;
  do {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();
  } while (await Room.findOne({ code }));
  return code;
}

// POST /create
router.post('/create', async (req, res) => {
  console.log(req.body)
  const { username } = req.body;
  let player = await Player.findOne({ username });
  if (!player) player = await Player.create({ username });

  const code = await genUniqueCode();

  const room = await Room.create({
    code,
    host: player._id,
    players: [player._id],
  });

  res.redirect(`/room/${room.code}?username=${encodeURIComponent(player.username)}`);
});

// POST /join
router.post('/join', async (req, res) => {
  const { username, code } = req.body;
  const room   = await Room.findOne({ code });
  if (!room) return res.status(404).send('Room not found.');

  let player = await Player.findOne({ username });
  if (!player) player = await Player.create({ username });

  // Add to room
  if (!room.players.includes(player._id)) {
    room.players.push(player._id);
    await room.save();
  }

   res.redirect(`/room/${room.code}?username=${encodeURIComponent(player.username)}`);
});

router.get('/room/:code', async (req, res) => {
  const { code } = req.params;
  const { username } = req.query;

  const room = await Room.findOne({ code })
    .populate('host', 'username')
    .populate('players', 'username');
  if (!room) return res.status(404).send('Room not found.');

  // Check if the current viewer is the host
  const isHost = room.host.username === username;

  res.render('room', {
    roomCode: room.code,
    players: room.players.map(p => p.username),
    host: room.host.username,
    currentUser: username,
    isHost,
  });
});

module.exports = router;
