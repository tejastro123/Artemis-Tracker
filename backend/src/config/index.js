require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3001,
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  MONGODB: {
    URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/artemis2',
  },

  NASA: {
    API_KEY: process.env.NASA_API_KEY || 'DEMO_KEY',
  },

  COMMUNITY_API: {
    BASE: process.env.COMMUNITY_API_BASE || 'https://artemis.cdnspace.ca',
    TIMEOUT_MS: parseInt(process.env.COMMUNITY_API_TIMEOUT_MS, 10) || 8000,
  },

  ADMIN: {
    API_KEY: process.env.ADMIN_API_KEY || 'change_me_in_production',
  },

  CORS: {
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://artemis-tracker-two.vercel.app').split(',').filter(Boolean),
  },

  CONSTANTS: {
    LAUNCH_EPOCH_UTC: new Date('2026-04-01T22:35:12Z'),
    COMMUNITY_ORBIT_POLL_MS: 300000,
    DSN_POLL_MS: 10000,
    WEATHER_POLL_MS: 900000,
    NEWS_POLL_MS: 300000,
    TELEMETRY_POLL_MS: 30000,
  },
};
