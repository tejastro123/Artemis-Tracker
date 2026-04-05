const config = require('../config');
const logger = require('../utils/logger');

class CommunityApi {
  constructor() {
    this.base = config.COMMUNITY_API.BASE;
  }

  async _fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        const resp = await fetch(url, options);
        if (!resp.ok) {
          logger.warn({ url, status: resp.status, statusText: resp.statusText }, `API Fetch Failed Attempt ${i+1}`);
          if (i === retries) return null;
          // Exponential backoff
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
        return await resp.json();
      } catch (err) {
        logger.error({ url, err: err.message }, `API Fetch Error Attempt ${i+1}`);
        if (i === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
    return null;
  }

  async getOrbit() {
    try {
      return await this._fetchWithRetry(`${this.base}/api/orbit`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Community Orbit API fetch failed');
      return null;
    }
  }

  async getDSN() {
    try {
      return await this._fetchWithRetry(`${this.base}/api/dsn`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Community DSN API fetch failed');
      return null;
    }
  }

  async getArow() {
    try {
      return await this._fetchWithRetry(`${this.base}/api/arow`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Community AROW API fetch failed');
      return null;
    }
  }

  async getAll() {
    try {
      return await this._fetchWithRetry(`${this.base}/api/all`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Community All API fetch failed');
      return null;
    }
  }

  async getTimeline() {
    try {
      return await this._fetchWithRetry(`${this.base}/api/timeline`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Community Timeline API fetch failed');
      return null;
    }
  }
}

module.exports = new CommunityApi();
