const roomManager = require('./roomManager');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/errors');

/**
 * Game engine — server-authoritative score calculation and validation.
 * This is a generic engine. Customize the validation rules for your game type.
 */
const gameEngine = {
  /**
   * Validate and process a score submission.
   * @param {string} roomId
   * @param {string} registrationNumber
   * @param {number} score - The score to set/add
   * @param {'set' | 'add'} mode - Whether to set or add to the current score
   */
  submitScore(roomId, registrationNumber, score, mode = 'set') {
    // Validate score bounds
    if (typeof score !== 'number' || isNaN(score)) {
      throw new ValidationError('Score must be a valid number.');
    }

    if (score < 0) {
      throw new ValidationError('Score cannot be negative.');
    }

    if (score > 1_000_000) {
      throw new ValidationError('Score exceeds maximum allowed value (1,000,000).');
    }

    // Validate room exists and game is active
    const room = roomManager.getRoom(roomId);

    if (room.status !== 'in_progress') {
      throw new ValidationError(`Cannot submit score — game status is "${room.status}".`);
    }

    // Apply score
    let result;
    if (mode === 'add') {
      result = roomManager.addScore(roomId, registrationNumber, score);
    } else {
      result = {
        room: roomManager.updateScore(roomId, registrationNumber, score),
        player: room.players.get(registrationNumber),
      };
    }

    logger.debug(`Score submitted: ${registrationNumber} → ${score} (${mode}) in room ${roomId}`);
    return result;
  },

  /**
   * Get current scores for a room (sorted descending).
   */
  getScoreboard(roomId) {
    return roomManager.getScoreboard(roomId);
  },
};

module.exports = gameEngine;
