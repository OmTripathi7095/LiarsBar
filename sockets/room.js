const Room = require('../models/room');
const Game = require('../models/game');
const { buildDeck, shuffle, deal } = require('../utils/deck');

module.exports = (io) => {
  io.on('connection', socket => {

    // 1) Join Room
    socket.on('join-room', async ({ roomCode, username }) => {
      socket.join(roomCode);
      const room = await Room.findOne({ code: roomCode }).populate('players', 'username');
      if (!room) return;
      const players = room.players.map(p => p.username);
      io.to(roomCode).emit('player-list', players);
    });

    // 2) Start Game
    socket.on('start-game', async ({ roomCode }) => {
      await Room.findOneAndUpdate({ code: roomCode }, { status: 'in-progress' });
      const room = await Room.findOne({ code: roomCode }).populate('players', 'username');
      if (!room) return;
      const players = room.players.map(p => p.username);

      const deck = shuffle(buildDeck());
      const { hands, deck: remaining } = deal(deck, players);

      const options = ['A','K','Q'];
      const cardOfTable = options[Math.floor(Math.random() * options.length)];

      const revolversMap = new Map();
      players.forEach(username => {
        revolversMap.set(username, {
          bulletPosition: Math.floor(Math.random() * 6),
          shotsTaken: 0
        });
      });

      await Game.create({
        roomCode,
        cardOfTable,
        deck: remaining,
        hands,
        turnIndex: 0,
        prevPlay: null,
        eliminated: [],
        revolvers: revolversMap
      });

      io.to(roomCode).emit('lobby-game-started');
      io.to(roomCode).emit('game-started', {
        cardOfTable,
        hands,
        turnIndex: 0,
        players,
        prevPlay: null
      });
    });

    // 3) Leave Room
    socket.on('leave-room', async ({ roomCode, username, isHost }) => {
      const room = await Room.findOne({ code: roomCode });

      if (!room) return;

      if (isHost) {
        await Room.deleteOne({ code: roomCode });
      } else {
        room.players = room.players.filter(p => p.username !== username);
        await room.save();
      }

      // Emit updated player list
      const updatedRoom = await Room.findOne({ code: roomCode }).populate('players', 'username');
      const players = updatedRoom ? updatedRoom.players.map(p => p.username) : [];
      io.to(roomCode).emit('player-list', players);

      socket.leave(roomCode);
    });

    socket.on('disconnect', () => {
      // Optional cleanup
    });
  });
};
