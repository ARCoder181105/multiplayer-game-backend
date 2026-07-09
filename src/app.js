require('dotenv').config();

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initSocket } = require('./socket/index');
const { generalLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger');
const { AppError } = require('./utils/errors');

// ─── Routes ──────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const gameRoutes = require('./routes/game');
const leaderboardRoutes = require('./routes/leaderboard');
const matchRoutes = require('./routes/matches');
const statsRoutes = require('./routes/stats');

// ─── Express App ─────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Global Middleware ───────────────────────────────────────────────
app.use(helmet());

const corsOrigins = env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',');
app.use(cors({
  origin: corsOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// ─── Health Check ────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: env.NODE_ENV,
  });
});

// ─── API Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/stats', statsRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found.`,
    },
  });
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || undefined,
      },
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError' && err.errors) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database validation failed.',
        details: Object.values(err.errors).map(e => ({
          field: e.path,
          message: e.message,
        })),
      },
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: `Duplicate value for ${field}.`,
      },
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid ${err.path}: ${err.value}`,
      },
    });
  }

  // Unknown errors
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production'
        ? 'An internal error occurred.'
        : err.message,
    },
  });
});

// ─── Startup ─────────────────────────────────────────────────────────
async function start() {
  // Connect to databases
  await connectDB();
  connectRedis();

  // Initialize Socket.io
  const io = initSocket(server);
  app.set('io', io);

  // Start listening
  server.listen(env.PORT, () => {
    logger.info(`
╔══════════════════════════════════════════════════╗
║         🎮 Game Backend API is running!         ║
╠══════════════════════════════════════════════════╣
║  Port:        ${String(env.PORT).padEnd(34)}║
║  Environment: ${env.NODE_ENV.padEnd(34)}║
║  Health:      http://localhost:${env.PORT}/health${' '.repeat(Math.max(0, 14 - String(env.PORT).length))}║
╚══════════════════════════════════════════════════╝
    `);
  });
}

// ─── Graceful Shutdown (for Render) ──────────────────────────────────
function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    } catch {
      // Ignore if not connected
    }

    try {
      const { getRedis } = require('./config/redis');
      const redis = getRedis();
      if (redis && typeof redis.quit === 'function') {
        await redis.quit();
        logger.info('Redis connection closed');
      }
    } catch {
      // Ignore if not connected
    }

    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Start the server ────────────────────────────────────────────────
start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
