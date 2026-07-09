const express = require('express');
const { authenticate } = require('../middleware/auth');
const matchService = require('../services/matchService');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();

// All match routes require authentication
router.use(authenticate);

// ─── GET /api/matches/history ────────────────────────────────────────
router.get('/history', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await matchService.getPlayerHistory(req.player.id, page, limit);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/matches/:matchId ───────────────────────────────────────
router.get('/:matchId', async (req, res, next) => {
  try {
    const match = await matchService.getMatch(req.params.matchId);

    if (!match) {
      throw new NotFoundError('Match');
    }

    res.json({
      success: true,
      data: { match },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
