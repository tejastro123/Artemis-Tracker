require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3001,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  DATABASE: {
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/artemis2',
    POSTGRES_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  },

  NASA: {
    API_KEY: process.env.NASA_API_KEY || 'DEMO_KEY',
  },

  COMMUNITY_API: {
    BASE: process.env.COMMUNITY_API_BASE || 'https://artemis.cdnspace.ca',
    TIMEOUT_MS: parseInt(process.env.COMMUNITY_API_TIMEOUT_MS, 10) || 30000,
  },

  ADMIN: {
    API_KEY: process.env.ADMIN_API_KEY || 'change_me_in_production',
  },

  CORS: {
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://artemis-tracker-two.vercel.app').split(',').map(o => o.trim()).filter(Boolean),
  },

  CONSTANTS: {
    LAUNCH_EPOCH_UTC: new Date('2026-04-01T22:35:12Z'),
    POLL_INTERVALS: {
      TELEMETRY: parseInt(process.env.TELEMETRY_POLL_MS, 10) || 30000,
      DSN: parseInt(process.env.DSN_POLL_MS, 10) || 10000,
      WEATHER: parseInt(process.env.WEATHER_POLL_MS, 10) || 900000,
      NEWS: parseInt(process.env.NEWS_POLL_MS, 10) || 300000,
      COMMUNITY_ORBIT: parseInt(process.env.COMMUNITY_ORBIT_POLL_MS, 10) || 300000,
    }
  },
};

// Simple validation
if (config.NODE_ENV === 'production' && config.ADMIN.API_KEY === 'change_me_in_production') {
  console.warn('WARNING: ADMIN_API_KEY is still using the default value in production!');
}

module.exports = config;
