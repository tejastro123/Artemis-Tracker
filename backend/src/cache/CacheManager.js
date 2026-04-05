const logger = require('../utils/logger');

/**
 * In-memory CacheManager implementation.
 * Replaces Redis for local, high-speed, volatile caching.
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    this._checkTtl(key);
    const value = this.cache.get(key);
    return value !== undefined ? JSON.parse(JSON.stringify(value)) : null;
  }

  async set(key, value, ttlSeconds) {
    this.cache.set(key, value);
    if (ttlSeconds) {
      this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
    } else {
      this.ttls.delete(key);
    }
  }

  async delete(key) {
    this.cache.delete(key);
    this.ttls.delete(key);
  }

  async invalidatePattern(pattern) {
    // Basic glob-like pattern matching (e.g. "news:*")
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
      }
    }
  }

  _checkTtl(key) {
    const expiry = this.ttls.get(key);
    if (expiry && Date.now() > expiry) {
      this.delete(key);
    }
  }
}

module.exports = CacheManager;
