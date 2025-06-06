// sockets/game.js
const Game = require('../models/game');

module.exports = (io) => {
  io.on('connection', socket => {
    console.log('🟢 New socket connection:', socket.id);

    // Helper: broadcast the complete game state to all clients in a room
    async function broadcastGameState(roomCode) {
      const game = await Game.findOne({ roomCode });
      if (!game) {
        console.log('⚠️ broadcastGameState: no game for room', roomCode);
        return;
      }
      const players     = Array.from(game.hands.keys());
      const cardOfTable = game.cardOfTable;
      const turnIndex   = game.turnIndex;
      const prevPlay    = game.prevPlay;
      const hands       = game.hands;
      const winners     = game.winners.slice(); // copy

      console.log('🔄 broadcastGameState → players:', players, 'turnIndex:', turnIndex);
      io.to(roomCode).emit('game-state', {
        cardOfTable,
        hands,
        turnIndex,
        players,
        prevPlay,
        winners
      });
    }

    // 1) Player joins /game/:roomCode → send them current state
    socket.on('join-game', async ({ roomCode, username }) => {
      console.log(`📥 join-game from ${username} in room ${roomCode}`);
      socket.join(roomCode);
      await broadcastGameState(roomCode);
    });

    // 2) Handle a player playing cards (max 3 per turn)
    socket.on('play-cards', async ({ roomCode, username, indices }) => {
      console.log(`▶️ play-cards from ${username} in ${roomCode}, indices:`, indices);
      const game = await Game.findOne({ roomCode });
      if (!game) {
        console.log('⚠️ play-cards: no game found');
        return;
      }

      // Reject > 3 cards
      if (indices.length > 3) {
        console.log(`❌ ${username} tried to play ${indices.length} cards (>3)`);
        return socket.emit('game-error', 'You can play at most 3 cards per turn.');
      }

      // Current players list
      const players = Array.from(game.hands.keys());
      const myIndex = players.indexOf(username);
      console.log('   players:', players, 'myIndex:', myIndex);

      // 2a) DEFAULT‐WIN check: if prevPlay.finished, award that winner and remove
      if (game.prevPlay && game.prevPlay.finished) {
        const target = game.prevPlay.by;
        console.log(`🏆 default-win: ${target} had finished previously.`);

        // Determine nextName before removing anyone
        const oldPlayers     = Array.from(game.hands.keys());
        const winnerOldIndex = oldPlayers.indexOf(target);
        const nextName       = oldPlayers[(winnerOldIndex + 1) % oldPlayers.length];
        console.log('   nextName (post-removal) should be:', nextName);

        // Announce winner
        io.to(roomCode).emit('player-won', { winner: target });

        // Add to winners array (only if not already there)
        if (!game.winners.includes(target)) {
          game.winners.push(target);
        }
        // Remove the winner from hands & revolvers
        game.hands.delete(target);
        game.revolvers.delete(target);
        await game.save();

        // Recompute players
        const newPlayers = Array.from(game.hands.keys());
        console.log('   newPlayers after removal:', newPlayers);

        // If only one remains → game over: push final to winners & emit
        if (newPlayers.length === 1) {
          if (!game.winners.includes(target)) {
            game.winners.push(target);
          }
          await game.save();
          console.log(`🎉 game-over: final winner ${newPlayers[0]}`);
          io.to(roomCode).emit('game-over', { winners: game.winners });
          await Game.deleteOne({ roomCode });
          return;
        }

        // Next turnIndex = index of nextName in newPlayers
        const newIdx = newPlayers.indexOf(nextName);
        game.turnIndex = newIdx >= 0 ? newIdx : 0;
        game.prevPlay  = null;
        await game.save();
        console.log('   new turnIndex after default-win:', game.turnIndex);

        await broadcastGameState(roomCode);
        // Fall through to let this same invocation continue to remove cards for username
      }

      // 2b) Enforce turn order
      const freshPlayers = Array.from(game.hands.keys());
      const freshIndex   = freshPlayers.indexOf(username);
      if (game.turnIndex !== freshIndex) {
        console.log(`❌ play-cards rejected: not ${username}’s turn.`);
        return socket.emit('game-error', 'Not your turn');
      }

      // 2c) Remove selected cards from this player's hand
      const hand = game.hands.get(username) || [];
      console.log('   current hand:', hand);
      indices.sort((a, b) => b - a);
      const removedCards = indices.map(i => hand.splice(i, 1)[0]);
      game.hands.set(username, hand);
      console.log('   removedCards:', removedCards, 'new hand:', hand);

      // 2d) Check if this emptied their hand
      const finished = (hand.length === 0);
      console.log(`   did ${username} finish?`, finished);

      // 2e) Record prevPlay
      game.prevPlay = {
        by:        username,
        cards:     removedCards,
        turnIndex: freshIndex,
        finished
      };

      // 2f) Advance turn to next player
      const afterPlayers = Array.from(game.hands.keys());
      game.turnIndex = (freshIndex + 1) % afterPlayers.length;
      await game.save();
      console.log('   advanced turnIndex to', game.turnIndex);

      // 2g) Notify clients
      io.to(roomCode).emit('play-made', {
        by:        username,
        count:     removedCards.length,
        turnIndex: game.turnIndex,
        finished
      });
      io.to(roomCode).emit('turn-changed', { turnIndex: game.turnIndex });

      // 2h) Update this player’s own hand
      socket.emit('update-hand', hand);
    });

    // 3) Handle “call-liar”
    socket.on('call-liar', async ({ roomCode, username }) => {
      console.log(`❓ call-liar by ${username} in ${roomCode}`);
      const game = await Game.findOne({ roomCode });
      if (!game || !game.prevPlay) {
        console.log('   ❌ call-liar: no game or no prevPlay');
        return;
      }

      // 1) Capture old players array
      const oldPlayers = Array.from(game.hands.keys());
      const callerIndex = oldPlayers.indexOf(username);
      const { prevPlay } = game;
      const nextAllowed  = (prevPlay.turnIndex + 1) % oldPlayers.length;
      console.log('   oldPlayers:', oldPlayers, 'callerIndex:', callerIndex, 'nextAllowed:', nextAllowed);

      // Enforce only immediate next player can call liar
      if (callerIndex !== nextAllowed) {
        console.log('   ❌ call-liar: not allowed');
        return socket.emit('game-error', 'You cannot call liar now');
      }

      // 2) Determine truth vs. lie
      const truths = [game.cardOfTable, 'JOKER'];
      const wasLie = prevPlay.cards.some(c => !truths.includes(c));
      const target = prevPlay.by;
      console.log(`   prevPlay.cards:`, prevPlay.cards, 'wasLie:', wasLie, 'target:', target);

      // Broadcast liar‐result
      io.to(roomCode).emit('liar-result', { caller: username, target, wasLie });

      // Helper: “pull the trigger” for playerName
      function fireShotFor(playerName) {
        const revolver = game.revolvers.get(playerName);
        if (!revolver) {
          console.log(`⚠️ fireShotFor: no revolver for ${playerName}`);
          return { died: false };
        }
        const { bulletPosition, shotsTaken } = revolver;
        if (shotsTaken === bulletPosition) {
          return { died: true };
        } else {
          revolver.shotsTaken = shotsTaken + 1;
          game.revolvers.set(playerName, revolver);
          return { died: false };
        }
      }

      // ---- CASE A: prevPlay.finished === true (someone just emptied) ----
      if (prevPlay.finished) {
        // A1) Truthful empty → caller shoots, then empty‐hand player wins
        if (!wasLie) {
          console.log(`   ${target} emptied truthfully. ${username} must shoot.`);
          const shotResult = fireShotFor(username);
          await game.save();

          if (shotResult.died) {
            console.log(`💥 ${username} pulled the trigger and died!`);
            io.to(roomCode).emit('player-shot', { player: username, died: true });

            // Eliminate caller
            game.hands.delete(username);
            game.revolvers.delete(username);
            await game.save();

            // Announce target as winner
            if (!game.winners.includes(target)) {
              game.winners.push(target);
            }
            io.to(roomCode).emit('player-won', { winner: target });

            // Recompute players after elimination
            const newPlayers = oldPlayers.filter(p => p !== username);
            console.log('   newPlayers after caller died:', newPlayers);

            if (newPlayers.length === 1) {
              const final = newPlayers[0];
              if (!game.winners.includes(final)) {
                game.winners.push(final);
              }
              await game.save();
              console.log(`🎉 game-over: final winner ${final}`);
              io.to(roomCode).emit('game-over', { winners: game.winners });
              await Game.deleteOne({ roomCode });
              return;
            }

            // Next turn: index of target in newPlayers
            const newIdx = newPlayers.indexOf(target);
            game.turnIndex = newIdx >= 0 ? newIdx : 0;
            game.prevPlay  = null;
            await game.save();
            console.log('   new turnIndex after caller died:', game.turnIndex);

            await broadcastGameState(roomCode);
            return;
          } else {
            console.log(`😅 ${username} pulled the trigger and survived!`);
            io.to(roomCode).emit('player-shot', { player: username, died: false });

            // Target still wins by emptying
            if (!game.winners.includes(target)) {
              game.winners.push(target);
            }
            io.to(roomCode).emit('player-won', { winner: target });

            // Remove target from game
            game.hands.delete(target);
            game.revolvers.delete(target);
            await game.save();

            // Recompute players after removing the target
            const newPlayers = oldPlayers.filter(p => p !== target);
            console.log('   newPlayers after target removed:', newPlayers);

            if (newPlayers.length === 1) {
              const final = newPlayers[0];
              if (!game.winners.includes(final)) {
                game.winners.push(final);
              }
              await game.save();
              console.log(`🎉 game-over: final winner ${final}`);
              io.to(roomCode).emit('game-over', { winners: game.winners });
              await Game.deleteOne({ roomCode });
              return;
            }

            // Next turn: whoever was after target in oldPlayers
            const targetIdxOld = oldPlayers.indexOf(target);
            const nextName     = oldPlayers[(targetIdxOld + 2) % oldPlayers.length];
            const newIdx2      = newPlayers.indexOf(nextName);
            game.turnIndex     = newIdx2 >= 0 ? newIdx2 : 0;
            game.prevPlay      = null;
            await game.save();
            console.log('   new turnIndex after target survived & removed:', game.turnIndex);

            await broadcastGameState(roomCode);
            return;
          }
        }

        // A2) Lying empty → target shoots, then either removed or declared winner if survives
        console.log(`   ${target} emptied but lied. ${target} must shoot.`);
        const shotResult = fireShotFor(target);
        await game.save();

        if (shotResult.died) {
          console.log(`💥 ${target} pulled the trigger and died!`);
          io.to(roomCode).emit('player-shot', { player: target, died: true });

          // Eliminate the liar
          game.hands.delete(target);
          game.revolvers.delete(target);
          await game.save();

          // No “empty‐hand win” for target. Next turn: caller remains
          const newPlayers = oldPlayers.filter(p => p !== target);
          console.log('   newPlayers after target died:', newPlayers);

          if (newPlayers.length === 1) {
            const final = newPlayers[0];
            if (!game.winners.includes(final)) {
              game.winners.push(final);
            }
            await game.save();
            console.log(`🎉 game-over: final winner ${final}`);
            io.to(roomCode).emit('game-over', { winners: game.winners });
            await Game.deleteOne({ roomCode });
            return;
          }

          const newIdx3 = newPlayers.indexOf(username);
          game.turnIndex = newIdx3 >= 0 ? newIdx3 : 0;
          game.prevPlay  = null;
          await game.save();
          console.log('   new turnIndex after target died:', game.turnIndex);

          await broadcastGameState(roomCode);
          return;
        } else {
          console.log(`😅 ${target} pulled the trigger and survived!`);
          io.to(roomCode).emit('player-shot', { player: target, died: false });

          // Target still “wins by emptying” (even though they lied). Push them to winners.
          if (!game.winners.includes(target)) {
            game.winners.push(target);
          }
          io.to(roomCode).emit('player-won', { winner: target });

          // Remove target
          game.hands.delete(target);
          game.revolvers.delete(target);
          await game.save();

          // Recompute players after removal
          const newPlayers = oldPlayers.filter(p => p !== target);
          console.log('   newPlayers after target survived & removed:', newPlayers);

          if (newPlayers.length === 1) {
            const final = newPlayers[0];
            if (!game.winners.includes(final)) {
              game.winners.push(final);
            }
            await game.save();
            console.log(`🎉 game-over: final winner ${final}`);
            io.to(roomCode).emit('game-over', { winners: game.winners });
            await Game.deleteOne({ roomCode });
            return;
          }

          // Next turn: player after target in oldPlayers
          const targetIdxOld2 = oldPlayers.indexOf(target);
          const nextName2     = oldPlayers[(targetIdxOld2 + 1) % oldPlayers.length];
          const newIdx4       = newPlayers.indexOf(nextName2);
          game.turnIndex      = newIdx4 >= 0 ? newIdx4 : 0;
          game.prevPlay       = null;
          await game.save();
          console.log('   new turnIndex after target survived & removed:', game.turnIndex);

          await broadcastGameState(roomCode);
          return;
        }
      }

      // ---- CASE B: prevPlay.finished === false (normal liar-call) ----
      console.log('   normal liar-call (no one just emptied).');
      const loser = wasLie ? target : username;
      console.log(`   shooter (loser) is: ${loser}`);

      // Do the shot
      const shotResult = fireShotFor(loser);
      await game.save();

      if (shotResult.died) {
        console.log(`💥 ${loser} pulled the trigger and died!`);
        io.to(roomCode).emit('player-shot', { player: loser, died: true });

        // Eliminate loser
        game.hands.delete(loser);
        game.revolvers.delete(loser);
        await game.save();

        // Recompute players & next turn
        const newPlayersNorm = oldPlayers.filter(p => p !== loser);
        console.log('   newPlayersNorm after loser died:', newPlayersNorm);

        if (newPlayersNorm.length === 1) {
          const final = newPlayersNorm[0];
          if (!game.winners.includes(final)) {
            game.winners.push(final);
          }
          await game.save();
          console.log(`🎉 game-over: final winner ${final}`);
          io.to(roomCode).emit('game-over', { winners: game.winners });
          await Game.deleteOne({ roomCode });
          return;
        }

        // Next turn = player after the loser in oldPlayers
        const loserOldIdx = oldPlayers.indexOf(loser);
        const nextNameN   = oldPlayers[(loserOldIdx + 1) % oldPlayers.length];
        const newIdxN     = newPlayersNorm.indexOf(nextNameN);
        game.turnIndex    = newIdxN >= 0 ? newIdxN : 0;
        game.prevPlay     = null;
        await game.save();
        console.log('   new turnIndex after loser died:', game.turnIndex);

        await broadcastGameState(roomCode);
        return;
      } else {
        console.log(`😅 ${loser} pulled the trigger and survived!`);
        io.to(roomCode).emit('player-shot', { player: loser, died: false });

        // Skip their turn by advancing to (loserOldIdx + 1)
        const loserOldIdx2 = oldPlayers.indexOf(loser);
        let temp = 0;
        if(wasLie === true)
          temp = 1;
        const newTurnIdx2  = (loserOldIdx2 + temp + 1) % oldPlayers.length;
        game.turnIndex     = newTurnIdx2;
        game.prevPlay      = null;
        await game.save();
        console.log('   new turnIndex after loser survived:', game.turnIndex);

        io.to(roomCode).emit('turn-changed', { turnIndex: game.turnIndex });
        return;
      }
    });
  });
};
