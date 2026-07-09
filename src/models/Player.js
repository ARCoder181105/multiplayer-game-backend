const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{6}$/,
    index: true,
  },
  stats: {
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
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

/**
 * Update player stats after a match.
 * @param {number} score - Score in this match
 * @param {boolean} isWin - Whether the player won
 */
playerSchema.methods.updateStats = function (score, isWin) {
  this.stats.totalGames += 1;
  if (isWin) this.stats.wins += 1;
  else this.stats.losses += 1;
  this.stats.totalScore += score;
  if (score > this.stats.bestScore) this.stats.bestScore = score;
  this.stats.avgScore = Math.round(this.stats.totalScore / this.stats.totalGames);
  return this.save();
};

const Player = mongoose.model('Player', playerSchema);

module.exports = Player;
