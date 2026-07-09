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
  score: {
    type: Number,
    default: 0,
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

const Player = mongoose.model('Player', playerSchema);

module.exports = Player;
