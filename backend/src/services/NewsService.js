const logger = require('../utils/logger');
const rss = require('../fetchers/rss');

const RSS_FEEDS = [
  { url: 'https://www.nasa.gov/missions/artemis/feed/', source: 'NASA', label: 'nasa' },
  { url: 'https://spaceflightnow.com/feed/', source: 'Spaceflight Now', label: 'sfn' },
  { url: 'https://www.nasaspaceflight.com/feed/', source: 'NASASpaceflight', label: 'nsf' },
  { url: 'https://arstechnica.com/science/feed/', source: 'Ars Technica', label: 'ars' },
];

class NewsService {
  constructor({ cache, db, newsQueries }) {
    this.cache = cache;
    this.db = db;
    this.newsQueries = newsQueries;
    this.CACHE_KEY = 'news:current';
    this.CACHE_TTL = 300; // 5 minutes
  }

  async getLatest(limit = 20) {
    try {
      const cached = await this.cache.get(this.CACHE_KEY);
      if (cached) return cached;
    } catch (err) {
      logger.warn({ err }, 'News cache read failed');
    }

    return await this._fetchAndCache(limit);
  }

  async _fetchAndCache(limit) {
    const [milestonesRes, ...rssResults] = await Promise.allSettled([
      fetch(`https://artemis.cdnspace.ca/api/timeline`).then(r => r.json()),
      ...RSS_FEEDS.map(feed => rss.fetch(feed.url, feed.source))
    ]);

    // Official mission highlights from timeline
    const missionHighlights = (milestonesRes.status === 'fulfilled' && milestonesRes.value.milestones)
      ? milestonesRes.value.milestones.map(m => ({
          title: m.title,
          summary: m.description,
          url: 'https://artemis.cdnspace.ca/timeline',
          source: 'Mission Control',
          sourceLabel: 'mil',
          date: m.metDate || new Date().toISOString(), // Use MET-relative date or now
          category: 'highlight'
        }))
      : [];

    const allItems = [
      ...missionHighlights,
      ...rssResults
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value)
    ]
      .filter(item => this._isArtemisRelated(item))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Deduplicate by URL
    const seen = new Set();
    const unique = allItems.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    const limited = unique.slice(0, limit);

    // Persist new items to DB
    try {
      await this.newsQueries.upsertNewsItems(limited);
    } catch (err) {
      logger.error({ err }, 'Failed to persist news items to DB');
    }

    const payload = {
      items: limited,
      fetchedAt: new Date().toISOString()
    };

    await this.cache.set(this.CACHE_KEY, payload, this.CACHE_TTL);
    return payload;
  }

  _isArtemisRelated(item) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const keywords = ['artemis', 'orion', 'sls', 'moon mission', 'lunar', 'wiseman',
                      'glover', 'koch', 'hansen', 'space launch system'];
    return keywords.some(k => text.includes(k));
  }
}

module.exports = NewsService;
