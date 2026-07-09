const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const Player = require('../models/Player');
const env = require('../config/env');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { NotFoundError } = require('../utils/errors');

const router = express.Router();

// ─── Validation Schemas ──────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long').trim(),
  registrationNumber: z.string().regex(/^\d{6}$/, 'Registration number must be exactly 6 digits'),
});

const loginSchema = z.object({
  registrationNumber: z.string().regex(/^\d{6}$/, 'Registration number must be exactly 6 digits'),
});

// ─── Helper ──────────────────────────────────────────────────────────
function generateToken(player) {
  return jwt.sign(
    {
      id: player._id || player.id,
      name: player.name,
      registrationNumber: player.registrationNumber,
      role: 'player',
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ─── POST /api/auth/register ─────────────────────────────────────────
// Seamless entry: registers if new, logs in if already existing.
router.post('/register', authLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, registrationNumber } = req.body;

    let player = await Player.findOne({ registrationNumber });
    let isNew = false;

    if (!player) {
      player = await Player.create({ name, registrationNumber, score: 0 });
      isNew = true;
    } else if (player.name !== name) {
      player.name = name;
      await player.save();
    }

    const token = generateToken(player);

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: {
        token,
        player: player.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────
router.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { registrationNumber } = req.body;

    const player = await Player.findOne({ registrationNumber });
    if (!player) {
      throw new NotFoundError('Player not found. Please check your registration number or register first.');
    }

    const token = generateToken(player);

    res.json({
      success: true,
      data: {
        token,
        player: player.toJSON(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/profile ───────────────────────────────────────────
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const player = await Player.findOne({ registrationNumber: req.player.registrationNumber });
    if (!player) {
      throw new NotFoundError('Player');
    }

    res.json({
      success: true,
      data: { player: player.toJSON() },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
