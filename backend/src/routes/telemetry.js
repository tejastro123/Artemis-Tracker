const express = require('express');
const router = express.Router();

module.exports = function(telemetryService) {
  router.get('/', async (req, res, next) => {
    try {
      const data = await telemetryService.getCurrent();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history', async (req, res, next) => {
    try {
      const hours = parseInt(req.query.hours, 10) || 2;
      const data = await telemetryService.getHistory(hours);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
