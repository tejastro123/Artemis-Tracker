const express = require('express');
const router = express.Router();
const mediaService = require('../services/MediaService');
const config = require('../config');
const { AppError, ValidationError } = require('../utils/errors');

function requireAdmin(req, res, next) {
  const adminKey = req.get('x-admin-key');

  if (!adminKey) {
    return next(new ValidationError('Missing admin API key'));
  }

  if (adminKey !== config.ADMIN.API_KEY) {
    return next(new AppError('Invalid admin API key', 401));
  }

  next();
}

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

  router.post('/', requireAdmin, async (req, res, next) => {
    try {
      const item = await mediaService.createMediaItem(req.body);
      res.status(201).json({
        item,
        message: 'Media item created successfully'
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
