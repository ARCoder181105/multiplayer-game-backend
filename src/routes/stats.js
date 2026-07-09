const express = require('express');
const Player = require('../models/Player');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();

// ─── GET /api/stats/:registrationNumber ──────────────────────────────
router.get('/:registrationNumber', async (req, res, next) => {
  try {
    const { registrationNumber } = req.params;

    const player = await Player.findOne({ registrationNumber }).lean();
    if (!player) {
      throw new NotFoundError('Player');
    }

    const winRate = player.stats.totalGames > 0
      ? Math.round((player.stats.wins / player.stats.totalGames) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        registrationNumber: player.registrationNumber,
        name: player.name,
        stats: {
          ...player.stats,
          winRate: `${winRate}%`,
        },
        memberSince: player.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
