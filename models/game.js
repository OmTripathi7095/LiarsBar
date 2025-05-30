// models/game.js
const mongoose = require('mongoose');
const { Schema,model } = mongoose;

const gameSchema = new Schema({
  room: {
    type: Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
  },
  cardOfTable: {
    type: String,
    enum: ['A', 'K', 'Q'],
  },
  deck: [String],          // e.g. ['A', 'Q', 'JOKER', …]
  hands: {                 // map of playerId → array of cards
    type: Map,
    of: [String],
  },
  turnIndex: Number,       // which player index is current
  eliminated: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
},                        // players who’ve died
}, {
  timestamps: true,
});

module.exports = model('Game', gameSchema);
