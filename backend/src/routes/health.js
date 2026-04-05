const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const os = require('os');

module.exports = function() {
  router.get('/', async (req, res) => {
    const health = {
      status: 'healthy',
      uptime: os.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        mongodb: 'disconnected',
      }
    };

    // Mongoose connection state: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
    const state = mongoose.connection.readyState;
    
    if (state === 1) {
      health.services.mongodb = 'connected';
    } else {
      health.status = 'degraded';
      if (state === 2) health.services.mongodb = 'connecting';
      if (state === 0) health.services.mongodb = 'disconnected';
    }

    res.status(health.status === 'healthy' ? 200 : 503).json(health);
  });

  return router;
};
