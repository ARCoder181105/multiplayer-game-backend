const express = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { scoreLimiter } = require('../middleware/rateLimiter');
const gameEngine = require('../services/gameEngine');
const roomManager = require('../services/roomManager');

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────
const submitScoreSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
  score: z.number().min(0, 'Score cannot be negative').max(1_000_000),
  mode: z.enum(['set', 'add']).default('set'),
});

const joinRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required'),
});

// All game routes require authentication
router.use(authenticate);

// ─── POST /api/game/join ─────────────────────────────────────────────
router.post('/join', validate(joinRoomSchema), (req, res, next) => {
  try {
    const room = roomManager.joinRoom(req.body.roomId, req.player);
    res.json({
      success: true,
      data: { room },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/game/leave ────────────────────────────────────────────
router.post('/leave', validate(joinRoomSchema), (req, res, next) => {
  try {
    const room = roomManager.leaveRoom(req.body.roomId, req.player.registrationNumber);
    res.json({
      success: true,
      data: { room },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/game/submit-score ─────────────────────────────────────
router.post('/submit-score', scoreLimiter, validate(submitScoreSchema), (req, res, next) => {
  try {
    const { roomId, score, mode } = req.body;
    const result = gameEngine.submitScore(roomId, req.player.registrationNumber, score, mode);

    res.json({
      success: true,
      data: {
        score: result.player?.score ?? score,
        scoreboard: gameEngine.getScoreboard(roomId),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/game/scoreboard/:roomId ────────────────────────────────
router.get('/scoreboard/:roomId', (req, res, next) => {
  try {
    const scoreboard = gameEngine.getScoreboard(req.params.roomId);
    res.json({
      success: true,
      data: { scoreboard },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/game/room/:roomId ──────────────────────────────────────
router.get('/room/:roomId', (req, res, next) => {
  try {
    const room = roomManager.getRoomInfo(req.params.roomId);
    res.json({
      success: true,
      data: { room },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
