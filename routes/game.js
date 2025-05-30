// routes/game.js
const express = require('express');
const router  = express.Router();
const Room    = require('../models/room');
const Game    = require('../models/game');   // if you set up a Game model
const { buildDeck, shuffle, deal } = require('../utils/deck');

router.get('/game/:code', async (req, res) => {
  const { code } = req.params;
  const { username } = req.query;

  const room = await Room.findOne({ code });
  if (!room) return res.status(404).send('Room not found.');
  if (room.status !== 'in-progress') {
    return res.redirect(`/room/${code}?username=${encodeURIComponent(username)}`);
  }

  res.render('game', {
    roomCode: code,
    currentUser: username
  });
});

module.exports = router;
