// sockets/room.js
const Room   = require('../models/room');
const Player = require('../models/player');

module.exports = (io) => {
  io.on('connection', socket => {
    console.log('🟢 Socket connected:', socket.id);

    socket.on('join-room', async ({ roomCode, username }) => {
      socket.join(roomCode);
      console.log(`${username} joined socket room ${roomCode}`);

      // Reload the room’s players from MongoDB
      const room = await Room.findOne({ code: roomCode })
        .populate('players', 'username');
      const players = room.players.map(p => p.username);

      // Broadcast the updated player list to everyone in that room
      io.to(roomCode).emit('player-list', players);
    });

    // When the host clicks “Start Game”
    socket.on('start-game', async ({ roomCode }) => {
      // Update room status in DB
      await Room.findOneAndUpdate(
        { code: roomCode },
        { status: 'in-progress' }
      );
      // Notify all clients in this room
      io.to(roomCode).emit('game-started');
    });

    socket.on('disconnect', () => {
      console.log('🔴 Socket disconnected:', socket.id);
    });
  });
};
