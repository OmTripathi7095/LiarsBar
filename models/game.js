// models/game.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub‐schema for the last play, including “finished”
const prevPlaySchema = new Schema({
  by:        { type: String },
  cards:     { type: [String], default: [] },
  turnIndex: { type: Number },
  finished:  { type: Boolean, default: false }
}, { _id: false });

// Sub‐schema for a player’s revolver state
const revolverSchema = new Schema({
  bulletPosition: { type: Number, required: true }, // 0..5
  shotsTaken:     { type: Number, default: 0 }       // how many empty pulls so far
}, { _id: false });

const gameSchema = new Schema({
  roomCode: {
    type: String,
    required: true,
    uppercase: true,
    length: 6
  },
  cardOfTable: {
    type: String,
    enum: ['A', 'K', 'Q'],
    required: true
  },
  prevPlay: {
    type: prevPlaySchema,
    default: null
  },
  turnIndex: {
    type: Number,
    default: 0
  },
  deck: {
    type: [String],
    default: []
  },
  hands: {
    type: Map,
    of: [String],
    default: {}
  },
  revolvers: {
    type: Map,
    of: revolverSchema,
    default: {}
  },
  eliminated: {
    type: [String],
    default: []
  },
  winners: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Game', gameSchema);
