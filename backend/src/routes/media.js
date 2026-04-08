const express = require('express');
const router = express.Router();
const mediaService = require('../services/MediaService');
const { ValidationError, AppError } = require('../utils/errors');
const {
  createAdminSession,
  isValidAdminCredential,
  requireAdminSession
} = require('../utils/adminSession');

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

  router.post('/admin/login', async (req, res, next) => {
    try {
      const password = typeof req.body.password === 'string'
        ? req.body.password.trim()
        : '';

      if (!password) {
        throw new ValidationError('Admin password is required');
      }

      if (!isValidAdminCredential(password)) {
        throw new AppError('Invalid admin credentials', 401);
      }

      const session = createAdminSession();
      res.json({
        authenticated: true,
        token: session.token,
        expiresAt: session.expiresAt
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/session', requireAdminSession, async (req, res, next) => {
    try {
      res.json({
        authenticated: true,
        expiresAt: new Date(req.adminSession.exp).toISOString()
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAdminSession, async (req, res, next) => {
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
