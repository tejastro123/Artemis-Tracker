const logger = require('../utils/logger');
const communityApi = require('../fetchers/communityApi');

class TimelineService {
  constructor({ cache, timelineQueries }) {
    this.cache = cache;
    this.timelineQueries = timelineQueries;
    this.communityApi = communityApi;
    this.CACHE_KEY = 'timeline:current';
    this.CACHE_TTL = 300; // 5 minutes
  }

  async getTimeline() {
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) return cached;

      // Fallback to DB
      if (this.timelineQueries) {
        const latest = await this.timelineQueries.getLatest();
        if (latest) {
          await this.cache.set(this.CACHE_KEY, latest, this.CACHE_TTL);
          return latest;
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Timeline cache/DB fallback failed');
    }

    return await this._fetchAndCache();
  }

  async _fetchAndCache() {
    try {
      const data = await this.communityApi.getTimeline();
      if (!data) return null;

      const snapshot = {
        milestones: data.milestones || [],
        activities: data.activities || [],
        phases: data.phases || [],
        source: 'community-timeline',
        capturedAt: new Date().toISOString(),
        raw: data
      };

      await this.cache.set(this.CACHE_KEY, snapshot, this.CACHE_TTL);
      
      if (this.timelineQueries) {
        await this.timelineQueries.insertSnapshot(snapshot);
      }

      return snapshot;
    } catch (err) {
      logger.error({ err }, 'Failed to fetch/persist timeline');
      return null;
    }
  }
}

module.exports = TimelineService;
