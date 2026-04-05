const express = require('express');
const router = express.Router();
const mediaService = require('../services/MediaService');

module.exports = function () {
  /**
   * @route GET /api/v1/media
   * @desc Get all gallery items (Local & Google Drive)
   */
  router.get('/', async (req, res, next) => {
    try {
      const media = await mediaService.getAllMedia();
      res.json(media);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
