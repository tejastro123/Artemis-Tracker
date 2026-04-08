const express = require('express');
const router = express.Router();
const mediaService = require('../services/MediaService');

module.exports = function () {
  /**
   * @route GET /api/v1/media
   * @desc Get the full media hub payload: images, videos, and important links
   */
  router.get('/', async (req, res, next) => {
    try {
      const media = await mediaService.getMediaHubData();
      res.json(media);
    } catch (err) {
      next(err);
    }
  });

  return router;
};
