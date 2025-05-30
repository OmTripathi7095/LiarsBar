const mongoose = require('mongoose');
const { Schema,model } = mongoose;

const playerSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  avatarUrl: String,            // optional avatar image
  stats: {
    gamesPlayed: { type: Number, default: 0 },
    gamesWon:    { type: Number, default: 0 },
    liarCalls:   {
      total:      { type: Number, default: 0 },
      successful: { type: Number, default: 0 },
    },
    rouletteSurvived: { type: Number, default: 0 },
  },
  achievements: [String],       // e.g. ["First Win", "Big Bluff"]
}, {
  timestamps: true,             // adds createdAt & updatedAt
});

module.exports = model('Player', playerSchema);
