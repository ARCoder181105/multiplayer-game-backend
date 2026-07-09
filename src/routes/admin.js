const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const env = require('../config/env');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const roomManager = require('../services/roomManager');
const matchService = require('../services/matchService');
const leaderboardService = require('../services/leaderboardService');
const Player = require('../models/Player');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────
const adminLoginSchema = z.object({
  adminSecret: z.string().min(1, 'Admin secret is required'),
});

const createRoomSchema = z.object({
  roomId: z.string().min(1, 'Room ID is required').max(50),
  name: z.string().max(100).optional(),
  maxPlayers: z.number().int().min(1).optional().nullable(),
});

// ─── POST /api/admin/login ───────────────────────────────────────────
router.post('/login', authLimiter, validate(adminLoginSchema), (req, res, next) => {
  try {
    const { adminSecret } = req.body;

    if (adminSecret !== env.ADMIN_SECRET) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_ERROR', message: 'Invalid admin secret.' },
      });
    }

    const token = jwt.sign({ role: 'admin' }, env.JWT_SECRET, { expiresIn: '12h' });

    res.json({
      success: true,
      data: { token, role: 'admin' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── All routes below require admin auth ─────────────────────────────
router.use(authenticate, requireAdmin);

// ─── POST /api/admin/rooms ───────────────────────────────────────────
router.post('/rooms', validate(createRoomSchema), (req, res, next) => {
  try {
    const { roomId, name, maxPlayers } = req.body;
    const room = roomManager.createRoom(roomId, name, maxPlayers || null);

    res.status(201).json({
      success: true,
      data: { room },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/rooms ────────────────────────────────────────────
router.get('/rooms', (req, res) => {
  const { status } = req.query;
  const rooms = roomManager.listRooms(status || null);

  res.json({
    success: true,
    data: { rooms, total: rooms.length },
  });
});

// ─── GET /api/admin/rooms/:roomId ────────────────────────────────────
router.get('/rooms/:roomId', (req, res, next) => {
  try {
    const room = roomManager.getRoomInfo(req.params.roomId);
    res.json({ success: true, data: { room } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/rooms/:roomId/start ─────────────────────────────
router.post('/rooms/:roomId/start', (req, res, next) => {
  try {
    const room = roomManager.startGame(req.params.roomId);
    res.json({
      success: true,
      data: { room, message: 'Game started!' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/rooms/:roomId/end ───────────────────────────────
router.post('/rooms/:roomId/end', async (req, res, next) => {
  try {
    const { room, results } = roomManager.endGame(req.params.roomId);

    // Record match in database
    let match = null;
    try {
      match = await matchService.recordMatch(req.params.roomId, results);
    } catch (err) {
      logger.error('Failed to record match (DB may be unavailable):', err.message);
    }

    res.json({
      success: true,
      data: { room, results, matchId: match?.id || null },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/rooms/:roomId ─────────────────────────────────
router.delete('/rooms/:roomId', async (req, res, next) => {
  try {
    const roomId = req.params.roomId;

    // Delete room state
    roomManager.deleteRoom(roomId);

    // Delete associated match records
    let deletedMatches = 0;
    try {
      deletedMatches = await matchService.deleteRoomMatches(roomId);
    } catch (err) {
      logger.error('Failed to delete room matches (DB may be unavailable):', err.message);
    }

    res.json({
      success: true,
      data: {
        message: `Room "${roomId}" deleted.`,
        deletedMatches,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/admin/data/reset ────────────────────────────────────
router.delete('/data/reset', async (req, res, next) => {
  try {
    // Reset everything
    roomManager.resetAll();

    let deletedMatches = 0;
    let deletedPlayers = 0;

    try {
      deletedMatches = await matchService.deleteAll();
      const result = await Player.deleteMany({});
      deletedPlayers = result.deletedCount;
      await leaderboardService.reset();
    } catch (err) {
      logger.error('Failed to reset database (DB may be unavailable):', err.message);
    }

    res.json({
      success: true,
      data: {
        message: 'All game data has been reset.',
        deletedPlayers,
        deletedMatches,
        roomsCleared: true,
        leaderboardReset: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
