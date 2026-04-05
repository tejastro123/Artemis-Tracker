const logger = require('../utils/logger');
const communityApi = require('../fetchers/communityApi');

class DSNService {
  constructor({ cache, dsnQueries }) {
    this.cache = cache;
    this.dsnQueries = dsnQueries;
    this.CACHE_KEY = 'dsn:current';
    this.CACHE_TTL = 10; // seconds
  }

  async getCurrent() {
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) return { ...cached, _source: 'cache' };

      // Cache miss: Try DB fallback
      if (this.dsnQueries) {
        const latest = await this.dsnQueries.getLatest();
        if (latest) {
          await this.cache.set(this.CACHE_KEY, latest, this.CACHE_TTL);
          return { ...latest, _source: 'db-fallback' };
        }
      }
    } catch (err) {
      logger.warn({ err }, 'DSN cache read or DB fallback failed');
    }

    return await this._fetchAndCache();
  }

  async _fetchAndCache() {
    let orionDishes = [];
    let source = 'unavailable';
    let communityPayload = null;
    let xmlPayload = null;

    // 1. Try consolidated community API
    try {
      communityPayload = await communityApi.getAll();
      if (communityPayload?.dsn?.dishes?.length > 0) {
        orionDishes = this._normalizeCommunityDSN(communityPayload.dsn.dishes);
        source = 'community-consolidated';
      }
    } catch (err) {
      logger.warn({ err }, 'Consolidated DSN API failed');
    }

    const data = {
      orionDishes,
      source,
      updatedAt: new Date().toISOString(),
      raw: {
        community: communityPayload,
        xml: xmlPayload
      }
    };

    try {
      await this.cache.set(this.CACHE_KEY, data, this.CACHE_TTL);
      if (this.dsnQueries) {
        await this.dsnQueries.insertSnapshot(data);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to persist DSN data');
    }

    return data;
  }

  _normalizeCommunityDSN(dishes) {
    return dishes.map(d => ({
      dish: d.dish || d.num || 'DSS',
      station: d.stationName || d.station || 'DSN',
      signal: d.uplinkActive && d.downlinkActive ? 'Uplink + Downlink' : (d.uplinkActive ? 'Uplink' : 'Downlink'),
      bands: [d.downlinkBand, d.uplinkBand].filter(Boolean),
      dataRateBps: d.downlinkRate || d.dataRate || 0,
      rtltSeconds: d.rtltSeconds || 0,
      rangeKm: d.rangeKm || 0,
      azDeg: d.azDeg || d.azimuth || 0,
      elDeg: d.elDeg || d.elevation || 0
    }));
  }

  _getStationName(dishName) {
    if (dishName.startsWith('DSS-1') || dishName.startsWith('DSS-2')) return 'Goldstone, CA';
    if (dishName.startsWith('DSS-3') || dishName.startsWith('DSS-4')) return 'Canberra, AU';
    if (dishName.startsWith('DSS-5') || dishName.startsWith('DSS-6')) return 'Madrid, ES';
    return 'Unknown Station';
  }
}

module.exports = DSNService;
