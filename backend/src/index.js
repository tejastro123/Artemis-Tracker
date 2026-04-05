const http = require('http');
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./utils/logger');
const CacheManager = require('./cache/CacheManager');
const TelemetryService = require('./services/TelemetryService');
const WeatherService = require('./services/WeatherService');
const DSNService = require('./services/DSNService');
const NewsService = require('./services/NewsService');
const TelemetryQueries = require('./db/queries/TelemetryQueries');
const NewsQueries = require('./db/queries/NewsQueries');
const WeatherQueries = require('./db/queries/WeatherQueries');
const DSNQueries = require('./db/queries/DSNQueries');
const TimelineQueries = require('./db/queries/TimelineQueries');
const WSServer = require('./websocket/WSServer');
const createApp = require('./app');
const nodeCron = require('node-cron');
const { setGlobalDispatcher, Agent } = require('undici');
const TimelineService = require('./services/TimelineService');

// Set robust connection timeouts for "Continuous Mode"
// We use 60s to ensure stability while preventing ECONNRESET issues with 0.
setGlobalDispatcher(new Agent({
  connectTimeout: 60000,
  headersTimeout: 60000,
  bodyTimeout: 60000,
  pipelining: 0 // Disable pipelining to reduce ECONNRESET on reused sockets
}));

async function main() {
  logger.info('Starting Artemis II Backend (MongoDB/In-Memory Cache Mode)...');

  // Connect to MongoDB (Atlas)
  try {
    await mongoose.connect(config.MONGODB.URI);
    logger.info('Connected to MongoDB Atlas');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  }

  // Initialize CacheManager (In-Memory)
  const cache = new CacheManager();

  // Initialize Queries
  const telemetryQueries = new TelemetryQueries();
  const newsQueries = new NewsQueries();
  const weatherQueries = new WeatherQueries();
  const dsnQueries = new DSNQueries();
  const timelineQueries = TimelineQueries; // This is a singleton export in my write_to_file

  // Initialize Services
  const services = {
    telemetry: new TelemetryService({ cache, telemetryQueries }),
    weather: new WeatherService({ cache, weatherQueries }),
    dsn: new DSNService({ cache, dsnQueries }),
    news: new NewsService({ cache, newsQueries }),
    timeline: new TimelineService({ cache, timelineQueries }),
  };

  // Initialize Express App
  const app = createApp({ services });
  const server = http.createServer(app);

  // Initialize WebSocket Server
  const wsServer = new WSServer(server, services);

  // Start Server
  server.listen(config.PORT, () => {
    logger.info(`Artemis II API listening on port ${config.PORT}`);
  });

  // Start Scheduler
  startScheduler(services, wsServer);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    server.close(async () => {
      await mongoose.disconnect();
      logger.info('Cleanup complete, exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function startScheduler(services, wsServer) {
  logger.info('Starting Scheduler...');

  // Telemetry: every 5 seconds (consolidated)
  nodeCron.schedule('*/5 * * * * *', async () => {
    logger.debug('Running scheduled consolidated telemetry update');
    const data = await services.telemetry.getCurrent();
    wsServer.broadcast('telemetry', data);
  });

  // DSN: synchronized with telemetry every 5 seconds
  nodeCron.schedule('*/5 * * * * *', async () => {
    logger.debug('Running scheduled DSN update');
    const data = await services.dsn.getCurrent();
    wsServer.broadcast('dsn', data);
  });

  // Timeline: every 5 minutes
  nodeCron.schedule('*/5 * * * *', async () => {
    logger.info('Running scheduled mission timeline update');
    const data = await services.timeline.getTimeline();
    wsServer.broadcast('timeline', data);
  });

  // Space weather: every 5 minutes
  nodeCron.schedule('*/5 * * * *', async () => {
    logger.info('Running scheduled space weather update');
    const data = await services.weather.getCurrent();
    wsServer.broadcast('weather', data);
  });

  // News: every 5 minutes (concurrent with timeline highlights)
  nodeCron.schedule('*/5 * * * *', async () => {
    logger.info('Running scheduled news update');
    const data = await services.news.getLatest();
    wsServer.broadcast('news', data);
  });
}

main().catch(err => {
  logger.fatal({ err }, 'Critical failure during startup');
  process.exit(1);
});
