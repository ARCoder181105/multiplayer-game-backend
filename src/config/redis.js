const logger = require('../utils/logger');
const env = require('./env');

/**
 * Redis client for leaderboard (sorted sets) and caching.
 * Uses @upstash/redis (HTTP REST API) for serverless and free tier stability.
 * Falls back to an in-memory mock when Upstash credentials are unavailable.
 */

let redisClient = null;
let isConnected = false;

/**
 * In-memory fallback that mimics the Redis sorted set API.
 * Used in development when Upstash URL/Token are not configured.
 */
class InMemoryRedis {
  constructor() {
    this.sortedSets = new Map();
    this.data = new Map();
  }

  async zadd(key, score, member) {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    this.sortedSets.get(key).set(member, score);
    return 1;
  }

  async zincrby(key, increment, member) {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    const set = this.sortedSets.get(key);
    const current = set.get(member) || 0;
    const newScore = current + increment;
    set.set(member, newScore);
    return newScore.toString();
  }

  async zrevrange(key, start, stop, withScores) {
    const set = this.sortedSets.get(key);
    if (!set) return [];
    const sorted = [...set.entries()].sort((a, b) => b[1] - a[1]);
    const sliced = sorted.slice(start, stop + 1);
    if (withScores === 'WITHSCORES' || withScores === true) {
      return sliced.flatMap(([member, score]) => [member, score.toString()]);
    }
    return sliced.map(([member]) => member);
  }

  async zrevrank(key, member) {
    const set = this.sortedSets.get(key);
    if (!set || !set.has(member)) return null;
    const sorted = [...set.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.findIndex(([m]) => m === member);
  }

  async zscore(key, member) {
    const set = this.sortedSets.get(key);
    if (!set || !set.has(member)) return null;
    return set.get(member).toString();
  }

  async zcard(key) {
    const set = this.sortedSets.get(key);
    return set ? set.size : 0;
  }

  async zrem(key, member) {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    return set.delete(member) ? 1 : 0;
  }

  async del(key) {
    this.sortedSets.delete(key);
    this.data.delete(key);
    return 1;
  }

  async flushall() {
    this.sortedSets.clear();
    this.data.clear();
    return 'OK';
  }

  async set(key, value) {
    this.data.set(key, value);
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async quit() {
    return 'OK';
  }
}

/**
 * Upstash Redis Adapter (@upstash/redis REST SDK).
 * Normalizes the API across @upstash/redis and our InMemoryRedis fallback.
 */
class UpstashRedisAdapter {
  constructor(url, token) {
    const { Redis } = require('@upstash/redis');
    this.client = new Redis({
      url,
      token,
    });
  }

  async zadd(key, score, member) {
    return this.client.zadd(key, { score: Number(score), member: String(member) });
  }

  async zincrby(key, increment, member) {
    const res = await this.client.zincrby(key, Number(increment), String(member));
    return res !== null && res !== undefined ? res.toString() : '0';
  }

  async zrevrange(key, start, stop, withScores) {
    const options = { rev: true };
    if (withScores === 'WITHSCORES' || withScores === true) {
      options.withScores = true;
    }
    const res = await this.client.zrange(key, start, stop, options);
    if (!res) return [];
    if (options.withScores) {
      // @upstash/redis zrange with withScores returns either [{member: "alice", score: 100}] or flat array ["alice", 100]
      if (Array.isArray(res) && res.length > 0 && typeof res[0] === 'object' && res[0] !== null && 'member' in res[0]) {
        return res.flatMap(item => [String(item.member), String(item.score)]);
      }
      return res.map(String);
    }
    return res.map(String);
  }

  async zrevrank(key, member) {
    const rank = await this.client.zrevrank(key, String(member));
    return rank !== null && rank !== undefined ? Number(rank) : null;
  }

  async zscore(key, member) {
    const score = await this.client.zscore(key, String(member));
    return score !== null && score !== undefined ? String(score) : null;
  }

  async zcard(key) {
    const count = await this.client.zcard(key);
    return count !== null && count !== undefined ? Number(count) : 0;
  }

  async zrem(key, member) {
    return this.client.zrem(key, String(member));
  }

  async del(key) {
    return this.client.del(key);
  }

  async flushall() {
    return this.client.flushall();
  }

  async set(key, value) {
    return this.client.set(key, value);
  }

  async get(key) {
    return this.client.get(key);
  }

  async quit() {
    return 'OK';
  }
}

function connectRedis() {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn('⚠️  UPSTASH_REDIS_REST_URL or TOKEN not set — using in-memory leaderboard (not persistent).');
    redisClient = new InMemoryRedis();
    isConnected = true;
    return redisClient;
  }

  try {
    redisClient = new UpstashRedisAdapter(url, token);
    isConnected = true;
    logger.info('✅ Connected to Upstash Redis (HTTP API)');
    return redisClient;
  } catch (err) {
    logger.error('❌ Failed to connect to Upstash Redis:', err.message);
    logger.warn('   Falling back to in-memory leaderboard.');
    redisClient = new InMemoryRedis();
    isConnected = true;
    return redisClient;
  }
}

function getRedis() {
  if (!redisClient) {
    return connectRedis();
  }
  return redisClient;
}

module.exports = { connectRedis, getRedis };
