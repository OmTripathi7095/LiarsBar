// sockets/room.js
const Room = require('../models/room');
const Game = require('../models/game');
const { buildDeck, shuffle, deal } = require('../utils/deck');

module.exports = (io) => {
  io.on('connection', socket => {
    // 1) When any client joins a lobby, subscribe them to that room and broadcast players
    socket.on('join-room', async ({ roomCode, username }) => {
      socket.join(roomCode);
      const room = await Room.findOne({ code: roomCode }).populate('players', 'username');
      if (!room) return;
      const players = room.players.map(p => p.username);
      io.to(roomCode).emit('player-list', players);
    });

    // 2) Host clicks “Start Game” in the lobby
    socket.on('start-game', async ({ roomCode }) => {
      // a) Update room status to in-progress
      await Room.findOneAndUpdate({ code: roomCode }, { status: 'in-progress' });

      // b) Build, shuffle, and deal the deck
      const room = await Room.findOne({ code: roomCode }).populate('players', 'username');
      if (!room) return;
      const players = room.players.map(p => p.username);

      const deck = shuffle(buildDeck());
      const { hands, deck: remaining } = deal(deck, players);

      // c) Pick one shared “card of the table”
      const options = ['A','K','Q'];
      const cardOfTable = options[Math.floor(Math.random() * options.length)];

      const revolversMap = new Map();
      players.forEach(username => {
        revolversMap.set(username, {
          bulletPosition: Math.floor(Math.random() * 6),
          shotsTaken: 0
        });
      });

      // d) Persist the new Game document
      const newGame = await Game.create({
        roomCode,
        cardOfTable,
        deck: remaining,
        hands,
        turnIndex: 0,
        prevPlay: null,
        eliminated: [],
        revolvers: revolversMap    // pass the map you just built
      });

      // e) Tell everyone in the lobby to redirect to /game/:roomCode
      io.to(roomCode).emit('lobby-game-started');

      // f) Also emit a “game-started” payload for anyone already on the game page
      io.to(roomCode).emit('game-started', {
        cardOfTable,
        hands,
        turnIndex: 0,
        players,
        prevPlay: null
      });
    });

    socket.on('disconnect', () => {
      // Optional cleanup
    });
  });
};
