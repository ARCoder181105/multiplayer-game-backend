const roomManager = require('../services/roomManager');
const gameEngine = require('../services/gameEngine');
const matchService = require('../services/matchService');
const logger = require('../utils/logger');

/**
 * Register real-time room events for a connected socket.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerRoomEvents(io, socket) {
  const player = socket.player;

  // ─── join_room ──────────────────────────────────────────────────
  socket.on('join_room', (data, callback) => {
    try {
      const { roomId } = data;
      const room = roomManager.joinRoom(roomId, player);

      socket.join(roomId);
      socket.currentRoom = roomId;

      // Notify others in the room
      socket.to(roomId).emit('player_joined', {
        player: {
          name: player.name,
          registrationNumber: player.registrationNumber,
        },
        room,
      });

      // Acknowledge to sender
      if (callback) callback({ success: true, room });

      logger.info(`[Socket] ${player.name} joined room ${roomId}`);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ─── leave_room ─────────────────────────────────────────────────
  socket.on('leave_room', (data, callback) => {
    try {
      const { roomId } = data;
      const room = roomManager.leaveRoom(roomId, player.registrationNumber);

      socket.leave(roomId);
      socket.currentRoom = null;

      // Notify others
      socket.to(roomId).emit('player_left', {
        player: {
          name: player.name,
          registrationNumber: player.registrationNumber,
        },
        room,
      });

      if (callback) callback({ success: true });

      logger.info(`[Socket] ${player.name} left room ${roomId}`);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ─── submit_action (score update) ──────────────────────────────
  socket.on('submit_action', (data, callback) => {
    try {
      const { roomId, score, mode } = data;
      const result = gameEngine.submitScore(
        roomId,
        player.registrationNumber,
        score,
        mode || 'set'
      );

      // Broadcast updated scoreboard to entire room
      const scoreboard = gameEngine.getScoreboard(roomId);
      io.to(roomId).emit('score_update', {
        player: {
          name: player.name,
          registrationNumber: player.registrationNumber,
          score: result.player?.score ?? score,
        },
        scoreboard,
      });

      if (callback) callback({ success: true, score: result.player?.score ?? score });
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ─── game_start (admin broadcasts to room) ─────────────────────
  socket.on('game_start', (data, callback) => {
    try {
      if (player.role !== 'admin') {
        throw new Error('Only admin can start games.');
      }

      const { roomId } = data;
      const room = roomManager.startGame(roomId);

      io.to(roomId).emit('game_started', { room });

      if (callback) callback({ success: true, room });
      logger.info(`[Socket] Admin started game in room ${roomId}`);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ─── game_end (admin ends game) ────────────────────────────────
  socket.on('game_end', async (data, callback) => {
    try {
      if (player.role !== 'admin') {
        throw new Error('Only admin can end games.');
      }

      const { roomId } = data;
      const { room, results } = roomManager.endGame(roomId);

      // Record match in database
      let match = null;
      try {
        match = await matchService.recordMatch(roomId, results);
      } catch (err) {
        logger.error('Failed to record match:', err.message);
      }

      // Broadcast results to all players in room
      io.to(roomId).emit('game_ended', {
        room,
        results,
        matchId: match?.id || null,
      });

      if (callback) callback({ success: true, room, results });
      logger.info(`[Socket] Admin ended game in room ${roomId}`);
    } catch (err) {
      if (callback) callback({ success: false, error: err.message });
    }
  });

  // ─── Handle disconnect — clean up from rooms ───────────────────
  socket.on('disconnect', () => {
    if (socket.currentRoom) {
      try {
        const room = roomManager.leaveRoom(socket.currentRoom, player.registrationNumber);
        socket.to(socket.currentRoom).emit('player_left', {
          player: {
            name: player.name,
            registrationNumber: player.registrationNumber,
          },
          room,
          reason: 'disconnected',
        });
      } catch {
        // Room may have been deleted — ignore
      }
    }
  });
}

module.exports = { registerRoomEvents };
