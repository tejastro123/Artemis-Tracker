const express = require('express');
const router = express.Router();

module.exports = function(dsnService) {
  router.get('/', async (req, res, next) => {
    try {
      const data = await dsnService.getCurrent();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
