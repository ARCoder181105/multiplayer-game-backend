const express = require('express');
const leaderboardService = require('../services/leaderboardService');
const Player = require('../models/Player');

const router = express.Router();

// ─── GET /api/leaderboard ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const players = await leaderboardService.getTopPlayers(limit);
    const total = await leaderboardService.getTotalPlayers();

    res.json({
      success: true,
      data: {
        leaderboard: players,
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
    const player = await Player.findOne({ registrationNumber }).lean();

    if (!player) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Player not found.' },
      });
    }

    res.json({
      success: true,
      data: {
        name: player.name,
        registrationNumber: player.registrationNumber,
        score: player.score || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
