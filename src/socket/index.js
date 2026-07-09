const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');
const { registerRoomEvents } = require('./roomEvents');

/**
 * Initialize Socket.io with JWT authentication on handshake.
 * @param {import('http').Server} httpServer
 */
function initSocket(httpServer) {
  const corsOrigins = env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS.split(',');

  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ─── Authentication Middleware ───────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required. Provide token in auth.token'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET);
      socket.player = decoded;
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token.'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.player.name || 'admin'} (${socket.id})`);

    // Register room event handlers
    registerRoomEvents(io, socket);

    // Heartbeat
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Socket disconnected: ${socket.player.name || 'admin'} (${reason})`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error for ${socket.player.name}:`, err.message);
    });
  });

  logger.info('🔌 Socket.io initialized');
  return io;
}

module.exports = { initSocket };
