const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — 1000 requests per minute per IP.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests. Please try again later.',
    },
  },
});

/**
 * Auth limiter — 300 requests per minute per IP.
 * High enough so 250+ players at a live LAN/event on shared WiFi can register smoothly.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many auth attempts. Please try again later.',
    },
  },
});

/**
 * Score submission limiter — 120 requests per minute per IP.
 */
const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many score submissions. Please slow down.',
    },
  },
});

module.exports = { generalLimiter, authLimiter, scoreLimiter };
