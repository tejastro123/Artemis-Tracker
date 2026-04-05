const WebSocket = require('ws');
const logger = require('../utils/logger');
const crypto = require('crypto');

class WSServer {
  constructor(httpServer, services) {
    this.wss = new WebSocket.Server({ noServer: true });
    this.services = services;
    this.clients = new Map(); // clientId -> { ws, channels: Set }

    // Upgrade HTTP connections to WebSocket on /ws path
    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/ws') {
        this.wss.handleUpgrade(req, socket, head, ws => {
          this.wss.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', this._handleConnection.bind(this));
  }

  _handleConnection(ws, req) {
    const clientId = crypto.randomUUID();
    this.clients.set(clientId, { ws, channels: new Set(['telemetry', 'weather', 'dsn']) });

    logger.info({ clientId }, 'WebSocket client connected');

    // Send initial state immediately on connect
    this._sendInitialState(ws);

    ws.on('message', data => this._handleMessage(clientId, data));
    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info({ clientId }, 'WebSocket client disconnected');
    });
    ws.on('error', err => {
      logger.warn({ clientId, err }, 'WebSocket client error');
      this.clients.delete(clientId);
    });

    // Heartbeat ping every 30s
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  }

  _handleMessage(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      const msg = JSON.parse(data);
      if (msg.type === 'subscribe') {
        client.channels.add(msg.channel);
        logger.debug({ clientId, channel: msg.channel }, 'Client subscribed');
      } else if (msg.type === 'unsubscribe') {
        client.channels.delete(msg.channel);
        logger.debug({ clientId, channel: msg.channel }, 'Client unsubscribed');
      }
    } catch (e) {
      logger.error({ data }, 'Malformed WebSocket message received');
    }
  }

  async _sendInitialState(ws) {
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const [telemetry, weather, dsn] = await Promise.allSettled([
        this.services.telemetry.getCurrent(),
        this.services.weather.getCurrent(),
        this.services.dsn.getCurrent(),
      ]);

      if (telemetry.status === 'fulfilled') {
        ws.send(JSON.stringify({ type: 'telemetry', data: telemetry.value }));
      }
      if (weather.status === 'fulfilled') {
        ws.send(JSON.stringify({ type: 'weather', data: weather.value }));
      }
      if (dsn.status === 'fulfilled') {
        ws.send(JSON.stringify({ type: 'dsn', data: dsn.value }));
      }
    } catch (e) {
      logger.error({ e }, 'Failed to send initial state to WebSocket client');
    }
  }

  /**
   * Broadcasts data to all clients subscribed to a specific channel.
   */
  broadcast(channel, data) {
    const message = JSON.stringify({ type: channel, data, timestamp: Date.now() });
    
    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      logger.debug({ channel, clientCount: sentCount }, 'Broadcast sent');
    }
  }
}

module.exports = WSServer;
