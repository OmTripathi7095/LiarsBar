const mongoose = require('mongoose');
const { Schema,model } = mongoose;

const roomSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    minlength: 6,
    maxlength: 6,                 // e.g. "AB12CD"
  },
  host: {
    type: Schema.Types.ObjectId,
    ref: 'Player',
    required: true,
  },
  players: [{
    type: Schema.Types.ObjectId,
    ref: 'Player',
  }],
  status: {
    type: String,
    enum: ['waiting', 'in-progress', 'finished'],
    default: 'waiting',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,             // adds updatedAt
});

module.exports = model('Room', roomSchema);
