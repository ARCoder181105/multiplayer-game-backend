const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { scoreLimiter } = require('../middleware/rateLimiter');
const Player = require('../models/Player');
const leaderboardService = require('../services/leaderboardService');
const { getIO } = require('../socket');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────
const submitScoreSchema = z.object({
  score: z.number().min(0, 'Score cannot be negative').max(1_000_000),
});

// All routes require authentication
router.use(authenticate);

// ─── POST /api/game/submit-score (and /api/score/submit) ─────────────
router.post('/submit-score', scoreLimiter, validate(submitScoreSchema), async (req, res, next) => {
  try {
    const { score } = req.body;
    const { registrationNumber } = req.player;

    const player = await Player.findOneAndUpdate(
      { registrationNumber },
      { score },
      { new: true }
    );

    if (!player) {
      throw new NotFoundError('Player not found');
    }

    // Update global leaderboard in Upstash Redis
    await leaderboardService.updateScore(registrationNumber, score);

    // Fetch live updated Top 10 leaderboard standings
    let top10 = [];
    try {
      top10 = await leaderboardService.getTopPlayers(10);
    } catch (e) {
      // Fallback if Redis/DB query fails
    }

    // Broadcast live update & leaderboard to all connected socket clients
    try {
      const io = getIO();
      if (io) {
        io.emit('score_updated', {
          registrationNumber,
          name: player.name,
          score,
          leaderboard: top10,
        });

        io.emit('leaderboard_updated', {
          leaderboard: top10,
        });
      }
    } catch (e) {
      // Ignore socket emit failures if socket is not initialized
    }

    res.json({
      success: true,
      data: {
        player: player.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
