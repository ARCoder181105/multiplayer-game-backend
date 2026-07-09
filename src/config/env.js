const { z } = require('zod');

/**
 * Centralized environment configuration.
 * Validates all required env vars at startup — fails fast if anything is missing.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal('')),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  ADMIN_SECRET: z.string().min(6, 'ADMIN_SECRET must be at least 6 characters'),
  CORS_ORIGINS: z.string().default('*'),
});

let env;
try {
  env = envSchema.parse(process.env);
} catch (err) {
  console.error('❌ Environment validation failed:');
  console.error(err.errors.map(e => `  ${e.path.join('.')}: ${e.message}`).join('\n'));
  process.exit(1);
}

module.exports = env;
