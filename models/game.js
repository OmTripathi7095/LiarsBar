// models/game.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const gameSchema = new Schema({
  roomCode: {
    type: String,
    required: true,
    uppercase: true,
    length: 6,
  },
  cardOfTable: {
    type: String,
    enum: ['A', 'K', 'Q'],
    required: true,
  },
  lastPlay: {
  by:     String,             // username
  cards:  [String],           // e.g. ['K','JOKER']
  turnIndex: Number
  },
  turnIndex: { type: Number, default: 0 },
  deck: {
    type: [String],
    default: [],
  },
  hands: {
    type: Map,
    of: [String],
    default: {},
  },
  turnIndex: {
    type: Number,
    default: 0,
  },
  eliminated: {
    type: [String],   // list of usernames who’ve died
    default: [],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Game', gameSchema);
