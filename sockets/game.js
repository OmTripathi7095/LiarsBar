// sockets/game.js
const Game = require('../models/game');

module.exports = (io) => {
  io.on('connection', socket => {

    // 1) Player joins the game room and grabs current state
    socket.on('join-game', async ({ roomCode, username }) => {
      socket.join(roomCode);

      // Fetch the already-created game
      const game = await Game.findOne({ roomCode });
      if (!game) {
        // Game hasn’t started yet
        return;
      }

      // Prepare data for client
      const players     = Array.from(game.hands.keys());
      const hand        = game.hands.get(username) || [];
      const { cardOfTable, turnIndex, lastPlay } = game;

      // Send full state
      socket.emit('game-state', {
        cardOfTable,
        hand,
        turnIndex,
        players,
        lastPlay
      });
    });

    // 2) Handle "play-cards" with strict turn enforcement
    socket.on('play-cards', async ({ roomCode, username, indices }) => {
      const game = await Game.findOne({ roomCode });
      if (!game) return;

      const players = Array.from(game.hands.keys());
      const myIndex = players.indexOf(username);

      // Enforce turn order
      if (game.turnIndex !== myIndex) {
        return socket.emit('error', 'Not your turn');
      }

      // Remove the selected cards from this player's hand
      const hand = game.hands.get(username) || [];
      indices
        .sort((a, b) => b - a)
        .forEach(i => hand.splice(i, 1));
      game.hands.set(username, hand);

      // Record last play
      game.lastPlay = {
        by: username,
        cards: indices.map(() => game.cardOfTable), // for truth-check later
        turnIndex: myIndex
      };

      // Advance turn
      game.turnIndex = (myIndex + 1) % players.length;
      await game.save();

      // Notify everyone
      io.to(roomCode).emit('log', `${username} played ${indices.length} card(s).`);
      io.to(roomCode).emit('turn-changed', { turnIndex: game.turnIndex });
      socket.emit('update-hand', hand);
    });

    // 3) Handle "call-liar" only by the next player
    socket.on('call-liar', async ({ roomCode, username }) => {
      const game = await Game.findOne({ roomCode });
      if (!game || !game.lastPlay) return;

      const players     = Array.from(game.hands.keys());
      const callerIndex = players.indexOf(username);
      const { lastPlay }= game;
      const nextAllowed = (lastPlay.turnIndex + 1) % players.length;

      // Only the immediate next player may call
      if (callerIndex !== nextAllowed) {
        return socket.emit('error', 'You cannot call liar now');
      }

      // Check truth vs lie
      const truths = [game.cardOfTable, 'JOKER'];
      const lied   = lastPlay.cards.some(c => !truths.includes(c));
      const loser  = lied ? lastPlay.by : username;

      io.to(roomCode).emit(
        'log',
        `${username} called liar on ${lastPlay.by}. ` +
        (lied
          ? `${lastPlay.by} lied and must face roulette.`
          : `${lastPlay.by} was truthful and ${username} must face roulette.`)
      );

      // Advance turn past the loser
      game.turnIndex = (lastPlay.turnIndex + 1) % players.length;
      await game.save();
      io.to(roomCode).emit('turn-changed', { turnIndex: game.turnIndex });
    });

  });
};
