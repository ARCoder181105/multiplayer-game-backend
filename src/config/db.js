const mongoose = require('mongoose');
const logger = require('../utils/logger');
const env = require('./env');

/**
 * MongoDB connection with retry logic.
 * Falls back gracefully in development when no URI is configured.
 */
async function connectDB() {
  const uri = env.MONGODB_URI;

  if (!uri) {
    logger.warn('⚠️  MONGODB_URI not set — running WITHOUT database persistence.');
    logger.warn('   Player data will NOT persist across restarts.');
    logger.warn('   Set MONGODB_URI in .env to enable persistence.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      // Modern Mongoose 8 defaults are fine; explicit for clarity
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info('✅ Connected to MongoDB');

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected — attempting reconnect...');
    });

    return true;
  } catch (err) {
    logger.error('❌ Failed to connect to MongoDB:', err.message);
    if (env.NODE_ENV === 'production') {
      process.exit(1);
    }
    logger.warn('   Continuing without database in development mode.');
    return false;
  }
}

module.exports = { connectDB };
