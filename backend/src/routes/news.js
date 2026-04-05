const express = require('express');
const router = express.Router();

module.exports = function(newsService) {
  router.get('/', async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const data = await newsService.getLatest(limit);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
