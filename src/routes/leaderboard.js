const express = require('express');
const { z } = require('zod');
const leaderboardService = require('../services/leaderboardService');
const Player = require('../models/Player');
const { validate } = require('../middleware/validate');
const logger = require('../utils/logger');

const router = express.Router();

// ─── GET /api/leaderboard ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const players = await leaderboardService.getTopPlayers(limit);

    // Enrich with player names
    const enriched = await enrichPlayers(players);
    const total = await leaderboardService.getTotalPlayers();

    res.json({
      success: true,
      data: {
        leaderboard: enriched,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaderboard/rank/:registrationNumber ───────────────────
router.get('/rank/:registrationNumber', async (req, res, next) => {
  try {
    const { registrationNumber } = req.params;
    const result = await leaderboardService.getPlayerRank(registrationNumber);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Player not found on leaderboard.' },
      });
    }

    // Enrich with name
    const player = await Player.findOne({ registrationNumber }).lean();
    result.name = player?.name || 'Unknown';

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaderboard/around/:registrationNumber ─────────────────
router.get('/around/:registrationNumber', async (req, res, next) => {
  try {
    const { registrationNumber } = req.params;
    const range = Math.min(parseInt(req.query.range) || 5, 20);

    const result = await leaderboardService.getAroundPlayer(registrationNumber, range);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Player not found on leaderboard.' },
      });
    }

    // Enrich with names
    result.players = await enrichPlayers(result.players);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Enrich leaderboard entries with player names from the database.
 */
async function enrichPlayers(entries) {
  try {
    const regNos = entries.map(e => e.registrationNumber);
    const players = await Player.find({ registrationNumber: { $in: regNos } }).lean();
    const nameMap = new Map(players.map(p => [p.registrationNumber, p.name]));

    return entries.map(e => ({
      ...e,
      name: nameMap.get(e.registrationNumber) || 'Unknown',
    }));
  } catch {
    // DB may be unavailable — return without names
    return entries.map(e => ({ ...e, name: 'Unknown' }));
  }
}

module.exports = router;
