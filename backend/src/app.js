const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');

// Routes
const telemetryRoutes = require('./routes/telemetry');
const weatherRoutes = require('./routes/weather');
const dsnRoutes = require('./routes/dsn');
const newsRoutes = require('./routes/news');
const timelineRoutes = require('./routes/timeline');
const healthRoutes = require('./routes/health');
const mediaRoutes = require('./routes/media');
const path = require('path');

module.exports = function createApp({ services }) {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || config.NODE_ENV === 'development') {
        return callback(null, true);
      }

      // Normalize origin and allowed origins to ignore trailing slashes
      const normalizedOrigin = origin.replace(/\/$/, "");
      const isAllowed = config.CORS.ALLOWED_ORIGINS.some(allowed => 
        allowed.replace(/\/$/, "") === normalizedOrigin
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        // Return false instead of an error to prevent server crashes
        callback(null, false);
      }
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
  }));
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
  app.use(express.json());

  // API Routes
  app.use('/api/v1/telemetry', telemetryRoutes(services.telemetry));
  app.use('/api/v1/weather', weatherRoutes(services.weather));
  app.use('/api/v1/dsn', dsnRoutes(services.dsn));
  app.use('/api/v1/news', newsRoutes(services.news));
  app.use('/api/v1/timeline', timelineRoutes(services.timeline));
  app.use('/api/v1/health', healthRoutes());
  app.use('/api/v1/media', mediaRoutes());

  // Static Media Serving
  app.use('/public', express.static(path.join(__dirname, '../public')));

  // Root route
  app.get('/', (req, res) => {
    res.json({ name: 'Artemis II API', version: '1.0.0' });
  });

  // Error handling
  app.use((err, req, res, next) => {
    logger.error({ err, path: req.path }, 'Unhandled API error');
    res.status(err.status || 500).json({
      error: config.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
    });
  });

  return app;
};
