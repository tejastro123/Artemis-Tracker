const express = require('express');
const router = express.Router();

module.exports = function(timelineService) {
  router.get('/current', async (req, res) => {
    try {
      const data = await timelineService.getTimeline();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
