const logger = require('../utils/logger');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');

/**
 * In-memory room state manager.
 * Rooms are created by admin, players join/leave in real-time.
 *
 * Room structure:
 * {
 *   id: string,
 *   name: string,
 *   maxPlayers: number | null (null = unlimited),
 *   status: 'waiting' | 'in_progress' | 'completed',
 *   players: Map<registrationNumber, { playerId, name, registrationNumber, score, ready }>,
 *   createdAt: Date,
 *   startedAt: Date | null,
 *   endedAt: Date | null,
 * }
 */
class RoomManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
  }

  /**
   * Create a new room (admin only).
   * @param {string} roomId - Unique room identifier
   * @param {string} name - Display name
   * @param {number|null} maxPlayers - Max players (null = unlimited)
   */
  createRoom(roomId, name, maxPlayers = null) {
    if (this.rooms.has(roomId)) {
      throw new ConflictError(`Room "${roomId}" already exists.`);
    }

    const room = {
      id: roomId,
      name: name || `Room ${roomId}`,
      maxPlayers,
      status: 'waiting',
      players: new Map(),
      createdAt: new Date(),
      startedAt: null,
      endedAt: null,
    };

    this.rooms.set(roomId, room);
    logger.info(`Room created: ${roomId} (max: ${maxPlayers || 'unlimited'})`);
    return this.serializeRoom(room);
  }

  /**
   * Add a player to a room.
   */
  joinRoom(roomId, player) {
    const room = this.getRoom(roomId);

    if (room.status === 'completed') {
      throw new ValidationError('This room\'s game has already ended.');
    }

    if (room.maxPlayers && room.players.size >= room.maxPlayers) {
      throw new ValidationError(`Room is full (max ${room.maxPlayers} players).`);
    }

    if (room.players.has(player.registrationNumber)) {
      // Already in room — update reference, don't error
      logger.debug(`Player ${player.registrationNumber} re-joined room ${roomId}`);
      return this.serializeRoom(room);
    }

    room.players.set(player.registrationNumber, {
      playerId: player.id,
      name: player.name,
      registrationNumber: player.registrationNumber,
      score: 0,
      ready: false,
    });

    logger.info(`Player ${player.name} (${player.registrationNumber}) joined room ${roomId}`);
    return this.serializeRoom(room);
  }

  /**
   * Remove a player from a room.
   */
  leaveRoom(roomId, registrationNumber) {
    const room = this.getRoom(roomId);
    room.players.delete(registrationNumber);
    logger.info(`Player ${registrationNumber} left room ${roomId}`);
    return this.serializeRoom(room);
  }

  /**
   * Start the game in a room.
   */
  startGame(roomId) {
    const room = this.getRoom(roomId);

    if (room.status !== 'waiting') {
      throw new ValidationError(`Cannot start game — room status is "${room.status}".`);
    }

    if (room.players.size < 1) {
      throw new ValidationError('Cannot start game — no players in the room.');
    }

    room.status = 'in_progress';
    room.startedAt = new Date();
    logger.info(`Game started in room ${roomId} with ${room.players.size} players`);
    return this.serializeRoom(room);
  }

  /**
   * Update a player's score in a room.
   */
  updateScore(roomId, registrationNumber, score) {
    const room = this.getRoom(roomId);
    const player = room.players.get(registrationNumber);

    if (!player) {
      throw new NotFoundError(`Player ${registrationNumber} not found in room ${roomId}`);
    }

    player.score = score;
    return this.serializeRoom(room);
  }

  /**
   * Add to a player's score (increment).
   */
  addScore(roomId, registrationNumber, points) {
    const room = this.getRoom(roomId);
    const player = room.players.get(registrationNumber);

    if (!player) {
      throw new NotFoundError(`Player ${registrationNumber} not found in room ${roomId}`);
    }

    player.score += points;
    return { player: { ...player }, room: this.serializeRoom(room) };
  }

  /**
   * End the game in a room. Returns final results with rankings.
   */
  endGame(roomId) {
    const room = this.getRoom(roomId);

    if (room.status === 'completed') {
      throw new ValidationError('Game already ended.');
    }

    room.status = 'completed';
    room.endedAt = new Date();

    // Calculate rankings
    const playerArray = [...room.players.values()];
    playerArray.sort((a, b) => b.score - a.score);
    playerArray.forEach((p, index) => { p.rank = index + 1; });

    const duration = room.startedAt
      ? Math.round((room.endedAt - room.startedAt) / 1000)
      : null;

    const winner = playerArray.length > 0 ? playerArray[0] : null;

    logger.info(`Game ended in room ${roomId}. Winner: ${winner?.name || 'none'}`);

    return {
      room: this.serializeRoom(room),
      results: {
        players: playerArray,
        winner,
        duration,
      },
    };
  }

  /**
   * Delete a room entirely.
   */
  deleteRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      throw new NotFoundError('Room');
    }
    this.rooms.delete(roomId);
    logger.info(`Room deleted: ${roomId}`);
    return true;
  }

  /**
   * Get room or throw.
   */
  getRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new NotFoundError('Room');
    }
    return room;
  }

  /**
   * Get room info (serialized).
   */
  getRoomInfo(roomId) {
    return this.serializeRoom(this.getRoom(roomId));
  }

  /**
   * List all rooms.
   */
  listRooms(status = null) {
    const rooms = [...this.rooms.values()];
    const filtered = status ? rooms.filter(r => r.status === status) : rooms;
    return filtered.map(r => this.serializeRoom(r));
  }

  /**
   * Get the scoreboard for a room (sorted by score descending).
   */
  getScoreboard(roomId) {
    const room = this.getRoom(roomId);
    const players = [...room.players.values()];
    players.sort((a, b) => b.score - a.score);
    players.forEach((p, i) => { p.rank = i + 1; });
    return players;
  }

  /**
   * Reset all rooms.
   */
  resetAll() {
    this.rooms.clear();
    logger.info('All rooms cleared');
  }

  /**
   * Serialize a room (convert Map to array for JSON).
   */
  serializeRoom(room) {
    return {
      id: room.id,
      name: room.name,
      maxPlayers: room.maxPlayers,
      status: room.status,
      playerCount: room.players.size,
      players: [...room.players.values()],
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      endedAt: room.endedAt,
    };
  }
}

// Singleton instance
const roomManager = new RoomManager();
module.exports = roomManager;
