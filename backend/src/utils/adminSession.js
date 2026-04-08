const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('./errors');

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function createAdminSession() {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + ADMIN_SESSION_TTL_MS
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.exp).toISOString()
  };
}

function requireAdminSession(req, res, next) {
  const token = req.get('x-admin-token');

  if (!token) {
    return next(new AppError('Admin login required', 401));
  }

  try {
    req.adminSession = verifyAdminSession(token);
    next();
  } catch (err) {
    next(err);
  }
}

function verifyAdminSession(token) {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new AppError('Invalid admin session', 401);
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new AppError('Invalid admin session', 401);
  }

  const encodedPayload = parts[0];
  const providedSignature = parts[1];
  const expectedSignature = sign(encodedPayload);

  if (!timingSafeEqual(providedSignature, expectedSignature)) {
    throw new AppError('Invalid admin session', 401);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (err) {
    throw new AppError('Invalid admin session', 401);
  }

  if (!payload || payload.role !== 'admin' || typeof payload.exp !== 'number') {
    throw new AppError('Invalid admin session', 401);
  }

  if (payload.exp <= Date.now()) {
    throw new AppError('Admin session expired', 401);
  }

  return payload;
}

function isValidAdminCredential(input) {
  return timingSafeEqual(input, config.ADMIN.API_KEY);
}

function sign(value) {
  return crypto
    .createHmac('sha256', config.ADMIN.API_KEY)
    .update(value)
    .digest('base64url');
}

function timingSafeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  createAdminSession,
  isValidAdminCredential,
  requireAdminSession,
  verifyAdminSession
};
