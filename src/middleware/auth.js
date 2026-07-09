const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AuthError, ForbiddenError } = require('../utils/errors');

/**
 * JWT authentication middleware.
 * Extracts token from Authorization header and attaches player data to req.player.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthError('Missing or invalid Authorization header. Use: Bearer <token>'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.player = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Token expired. Please login again.'));
    }
    return next(new AuthError('Invalid token.'));
  }
}

/**
 * Admin-only middleware.
 * Must be used AFTER authenticate — checks for role: "admin" in JWT claims.
 */
function requireAdmin(req, res, next) {
  if (!req.player || req.player.role !== 'admin') {
    return next(new ForbiddenError('Admin access required.'));
  }
  next();
}

module.exports = { authenticate, requireAdmin };
