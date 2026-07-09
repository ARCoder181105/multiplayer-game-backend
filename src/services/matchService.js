const Match = require('../models/Match');
const Player = require('../models/Player');
const leaderboardService = require('./leaderboardService');
const logger = require('../utils/logger');

/**
 * Match service — handles recording and querying match results.
 */
const matchService = {
  /**
   * Record a completed match.
   * Creates Match document, updates player stats, and updates leaderboard.
   * @param {object} gameResults - From roomManager.endGame()
   */
  async recordMatch(roomId, gameResults) {
    try {
      const { players, winner, duration } = gameResults;

      // Create match record
      const match = await Match.create({
        roomId,
        players: players.map(p => ({
          playerId: p.playerId,
          registrationNumber: p.registrationNumber,
          name: p.name,
          score: p.score,
          rank: p.rank,
        })),
        status: 'completed',
        duration,
        winner: winner ? {
          playerId: winner.playerId,
          registrationNumber: winner.registrationNumber,
          name: winner.name,
        } : null,
        endedAt: new Date(),
      });

      // Update each player's stats and leaderboard
      for (const p of players) {
        const isWin = winner && p.registrationNumber === winner.registrationNumber;

        try {
          const player = await Player.findById(p.playerId);
          if (player) {
            await player.updateStats(p.score, isWin);

            // Update leaderboard with total score
            await leaderboardService.updateScore(
              p.registrationNumber,
              player.stats.totalScore
            );
          }
        } catch (err) {
          logger.error(`Failed to update stats for player ${p.registrationNumber}:`, err);
        }
      }

      logger.info(`Match recorded: ${match.id} in room ${roomId}`);
      return match;
    } catch (err) {
      logger.error(`Failed to record match for room ${roomId}:`, err);
      throw err;
    }
  },

  /**
   * Get match history for a player (paginated).
   * @param {string} playerId - MongoDB ObjectId
   * @param {number} page
   * @param {number} limit
   */
  async getPlayerHistory(playerId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
      Match.find({ 'players.playerId': playerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Match.countDocuments({ 'players.playerId': playerId }),
    ]);

    return {
      matches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a specific match by ID.
   */
  async getMatch(matchId) {
    return Match.findById(matchId).lean();
  },

  /**
   * Delete all matches for a room.
   */
  async deleteRoomMatches(roomId) {
    const result = await Match.deleteMany({ roomId });
    logger.info(`Deleted ${result.deletedCount} matches for room ${roomId}`);
    return result.deletedCount;
  },

  /**
   * Delete all matches (reset).
   */
  async deleteAll() {
    const result = await Match.deleteMany({});
    logger.info(`Deleted all matches (${result.deletedCount})`);
    return result.deletedCount;
  },
};

module.exports = matchService;
