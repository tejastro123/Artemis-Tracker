const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { AppError, NotFoundError } = require('./utils/errors');

// Routes
const telemetryRoutes = require('./routes/telemetry');
const weatherRoutes = require('./routes/weather');
const dsnRoutes = require('./routes/dsn');
const newsRoutes = require('./routes/news');
const timelineRoutes = require('./routes/timeline');
const healthRoutes = require('./routes/health');
const mediaRoutes = require('./routes/media');

module.exports = function createApp({ services }) {
  const app = express();

  // Security & Utility Middleware
  app.use(helmet());
  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || config.NODE_ENV === 'development') {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/$/, "");
      const isAllowed = config.CORS.ALLOWED_ORIGINS.some(allowed => 
        allowed.replace(/\/$/, "") === normalizedOrigin
      );
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'x-admin-key'],
  }));

  // Request logging using pino-aware morgan stream
  app.use(morgan('combined', { 
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req, res) => req.url === '/api/v1/health' // Skip health checks in logs
  }));

  app.use(express.json({ limit: '35mb' }));

  // Static Media Serving
  app.use('/public', express.static(path.join(__dirname, '../public')));

  // API Routes
  app.use('/api/v1/telemetry', telemetryRoutes(services.telemetry));
  app.use('/api/v1/weather', weatherRoutes(services.weather));
  app.use('/api/v1/dsn', dsnRoutes(services.dsn));
  app.use('/api/v1/news', newsRoutes(services.news));
  app.use('/api/v1/timeline', timelineRoutes(services.timeline));
  app.use('/api/v1/health', healthRoutes());
  app.use('/api/v1/media', mediaRoutes());

  // Root route
  app.get('/', (req, res) => {
    res.json({ 
      name: 'Artemis II API', 
      version: '1.0.0',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });

  // Express 5 rejects a bare "*" route, so use a final catch-all middleware
  // after all known routes have been registered.
  app.use((req, res, next) => {
    next(new NotFoundError(`Can't find ${req.originalUrl} on this server!`));
  });

  // Global Error handling
  app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log the error
    if (err.statusCode >= 500) {
      logger.error({ 
        err, 
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body 
      }, 'Critical API error');
    } else {
      logger.warn({ err, path: req.path }, 'API error');
    }

    res.status(err.statusCode).json({
      status: err.status,
      error: config.NODE_ENV === 'production' && err.statusCode === 500
        ? 'Internal Server Error' 
        : err.message,
      ...(config.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  return app;
};
