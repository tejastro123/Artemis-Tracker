# Artemis II Mission Tracker — Backend

This is the dedicated Node.js backend for the Artemis II Mission Tracker. It provides a unified API and real-time WebSocket updates for mission telemetry, space weather, and DSN tracking status.

## Technologies
- **Runtime**: Node.js 22+
- **Framework**: Express 5
- **Real-time**: WebSockets (ws)
- **Cache**: Redis 7
- **Database**: PostgreSQL 16
- **Broadcasting**: node-cron

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your NASA API Key.
   ```bash
   cp .env.example .env
   ```

3. **Start Infrastructure**:
   Start Redis and PostgreSQL using Docker Compose.
   ```bash
   docker-compose up -d
   ```

4. **Run the Server**:
   ```bash
   # Development (with nodemon)
   npm run dev

   # Production
   npm start
   ```

## API Reference

- `GET /api/v1/telemetry`: Current orbital telemetry (fallback chain)
- `GET /api/v1/weather`: NASA DONKI space weather summary
- `GET /api/v1/dsn`: Deep Space Network status
- `GET /api/v1/news`: Aggregated Artemis II news
- `GET /api/v1/health`: Service health check

## WebSocket

Join the real-time stream at `ws://localhost:3001/ws`.
Clients are automatically subscribed to `telemetry`, `weather`, and `dsn` channels.
