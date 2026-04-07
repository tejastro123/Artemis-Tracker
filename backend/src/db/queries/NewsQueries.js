const logger = require('../../utils/logger');
const NewsItem = require('../models/NewsItem');
const { InternalServerError } = require('../../utils/errors');

class NewsQueries {
  /**
   * Upserts a list of news items into MongoDB.
   */
  async upsertNewsItems(items) {
    try {
      const results = await Promise.all(
        items.map(async item => {
          return NewsItem.findOneAndUpdate(
            { url: item.url },
            {
              title: item.title,
              summary: item.summary,
              source: item.source,
              publishedAt: item.date
            },
            { upsert: true, new: true }
          );
        })
      );
      return results.map(r => r._id);
    } catch (err) {
      logger.error({ err, items }, 'Database: Failed to upsert news items');
      throw new InternalServerError('Failed to save news items');
    }
  }

  /**
   * Retrieves the latest news items from MongoDB.
   */
  async getLatestNews(limit = 20) {
    try {
      return await NewsItem.find({})
        .sort({ publishedAt: -1 })
        .limit(limit)
        .lean();
    } catch (err) {
      logger.error({ err, limit }, 'Database: Failed to retrieve latest news items');
      return [];
    }
  }
}

module.exports = NewsQueries;
