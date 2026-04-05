const express = require('express');
const router = express.Router();

module.exports = function(weatherService) {
  router.get('/', async (req, res, next) => {
    try {
      const data = await weatherService.getCurrent();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
