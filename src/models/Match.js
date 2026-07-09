const mongoose = require('mongoose');

const matchPlayerSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  registrationNumber: { type: String, required: true },
  name: { type: String, required: true },
  score: { type: Number, required: true, default: 0 },
  rank: { type: Number, default: null },
}, { _id: false });

const matchSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  players: {
    type: [matchPlayerSchema],
    required: true,
  },
  gameType: {
    type: String,
    default: 'default',
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'cancelled'],
    default: 'in_progress',
  },
  duration: {
    type: Number, // seconds
    default: null,
  },
  winner: {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    registrationNumber: { type: String, default: null },
    name: { type: String, default: null },
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  endedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

// Index for efficient player match history queries
matchSchema.index({ 'players.playerId': 1, createdAt: -1 });

const Match = mongoose.model('Match', matchSchema);

module.exports = Match;
