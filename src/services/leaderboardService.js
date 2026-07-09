const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

const LEADERBOARD_KEY = 'leaderboard:global';

/**
 * Leaderboard service powered by Redis Sorted Sets.
 * O(log N) for updates, O(log N + M) for range queries.
 */
const leaderboardService = {
  /**
   * Update a player's score in the leaderboard.
   * Uses ZADD to set the score (replaces if player exists).
   * @param {string} registrationNumber
   * @param {number} totalScore - Player's cumulative total score
   */
  async updateScore(registrationNumber, totalScore) {
    const redis = getRedis();
    await redis.zadd(LEADERBOARD_KEY, totalScore, registrationNumber);
    logger.debug(`Leaderboard updated: ${registrationNumber} → ${totalScore}`);
  },

  /**
   * Increment a player's leaderboard score.
   * @param {string} registrationNumber
   * @param {number} increment
   */
  async incrementScore(registrationNumber, increment) {
    const redis = getRedis();
    const newScore = await redis.zincrby(LEADERBOARD_KEY, increment, registrationNumber);
    logger.debug(`Leaderboard incremented: ${registrationNumber} += ${increment} → ${newScore}`);
    return parseFloat(newScore);
  },

  /**
   * Get top N players.
   * @param {number} count - How many to return (default 10)
   * @returns {Array<{ rank, registrationNumber, score }>}
   */
  async getTopPlayers(count = 10) {
    const redis = getRedis();
    const results = await redis.zrevrange(LEADERBOARD_KEY, 0, count - 1, 'WITHSCORES');
    return this._parseResults(results);
  },

  /**
   * Get a player's rank (0-indexed from Redis, we return 1-indexed).
   * @param {string} registrationNumber
   * @returns {{ rank, score } | null}
   */
  async getPlayerRank(registrationNumber) {
    const redis = getRedis();
    const rank = await redis.zrevrank(LEADERBOARD_KEY, registrationNumber);

    if (rank === null) return null;

    const score = await redis.zscore(LEADERBOARD_KEY, registrationNumber);
    return {
      rank: rank + 1,
      registrationNumber,
      score: parseFloat(score),
    };
  },

  /**
   * Get players around a specific player (±range).
   * @param {string} registrationNumber
   * @param {number} range - How many players above/below (default 5)
   */
  async getAroundPlayer(registrationNumber, range = 5) {
    const redis = getRedis();
    const rank = await redis.zrevrank(LEADERBOARD_KEY, registrationNumber);

    if (rank === null) return null;

    const start = Math.max(0, rank - range);
    const stop = rank + range;

    const results = await redis.zrevrange(LEADERBOARD_KEY, start, stop, 'WITHSCORES');
    return {
      playerRank: rank + 1,
      players: this._parseResults(results, start),
    };
  },

  /**
   * Get total number of players on the leaderboard.
   */
  async getTotalPlayers() {
    const redis = getRedis();
    return redis.zcard(LEADERBOARD_KEY);
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
   * Redis returns: [member1, score1, member2, score2, ...]
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
