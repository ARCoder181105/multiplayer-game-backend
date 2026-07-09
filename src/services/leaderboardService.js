const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');
const Player = require('../models/Player');

const LEADERBOARD_KEY = 'leaderboard:global';

/**
 * Leaderboard service powered by Redis Sorted Sets with MongoDB enrichment.
 * O(log N) for updates, O(log N + M) for range queries.
 */
const leaderboardService = {
  /**
   * Update a player's score in the leaderboard.
   * Uses ZADD to set the score.
   * @param {string} registrationNumber
   * @param {number} totalScore - Player's cumulative or average score
   */
  async updateScore(registrationNumber, totalScore) {
    const redis = getRedis();
    await redis.zadd(LEADERBOARD_KEY, totalScore, registrationNumber);
    logger.debug(`Leaderboard updated: ${registrationNumber} → ${totalScore}`);
  },

  /**
   * Get top N players enriched with player names from MongoDB.
   * @param {number} count - How many to return (default 10)
   * @returns {Array<{ rank, registrationNumber, name, score }>}
   */
  async getTopPlayers(count = 10) {
    const redis = getRedis();
    const results = await redis.zrevrange(LEADERBOARD_KEY, 0, count - 1, 'WITHSCORES');
    const parsed = this._parseResults(results);

    // If Redis is empty, fall back to querying MongoDB directly
    if (parsed.length === 0) {
      const dbPlayers = await Player.find().sort({ score: -1 }).limit(count).lean();
      return dbPlayers.map((p, index) => ({
        rank: index + 1,
        registrationNumber: p.registrationNumber,
        name: p.name,
        score: p.score || 0,
      }));
    }

    // Enrich with names from MongoDB
    const regNos = parsed.map(p => p.registrationNumber);
    const dbPlayers = await Player.find({ registrationNumber: { $in: regNos } }).lean();
    const nameMap = {};
    dbPlayers.forEach(p => {
      nameMap[p.registrationNumber] = p.name;
    });

    return parsed.map(p => ({
      ...p,
      name: nameMap[p.registrationNumber] || 'Unknown Player',
    }));
  },

  /**
   * Get total number of players on the leaderboard.
   */
  async getTotalPlayers() {
    const redis = getRedis();
    const count = await redis.zcard(LEADERBOARD_KEY);
    if (count === 0) {
      return Player.countDocuments();
    }
    return count;
  },

  /**
   * Remove a player from the leaderboard.
   */
  async removePlayer(registrationNumber) {
    const redis = getRedis();
    await redis.zrem(LEADERBOARD_KEY, registrationNumber);
  },

  /**
   * Reset the entire leaderboard.
   */
  async reset() {
    const redis = getRedis();
    await redis.del(LEADERBOARD_KEY);
    logger.info('Leaderboard reset');
  },

  /**
   * Parse WITHSCORES results from Redis.
   */
  _parseResults(results, startRank = 0) {
    const players = [];
    for (let i = 0; i < results.length; i += 2) {
      players.push({
        rank: startRank + (i / 2) + 1,
        registrationNumber: results[i],
        score: parseFloat(results[i + 1]),
      });
    }
    return players;
  },
};

module.exports = leaderboardService;
