const config = require('../config');
const logger = require('../utils/logger');

class DonkiFetcher {
  constructor() {
    this.BASE_URL = 'https://api.nasa.gov/DONKI';
    this.KEY = config.NASA.API_KEY;
  }

  async getSolarFlares() {
    return this._fetch('/FLR');
  }

  async getCMEs() {
    return this._fetch('/CME');
  }

  async getGeomagneticStorms() {
    return this._fetch('/GST');
  }

  async getSEPEvents() {
    return this._fetch('/SEP');
  }

  async _fetch(endpoint) {
    try {
      const url = `${this.BASE_URL}${endpoint}?api_key=${this.KEY}`;
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!resp.ok) {
        logger.warn({ endpoint, status: resp.status }, 'NASA DONKI API error');
        return [];
      }
      return await resp.json();
    } catch (err) {
      logger.error({ err, endpoint }, 'NASA DONKI fetch failed');
      return [];
    }
  }
}

module.exports = new DonkiFetcher();
