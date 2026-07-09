const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — 100 requests per minute per IP.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
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
 * Stricter limiter for auth endpoints — 10 requests per minute per IP.
 */
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
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
 * Score submission limiter — 30 requests per minute per IP.
 */
const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
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
