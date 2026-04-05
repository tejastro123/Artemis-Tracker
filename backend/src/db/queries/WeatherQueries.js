const logger = require('../../utils/logger');
const WeatherSnapshot = require('../models/WeatherSnapshot');

class WeatherQueries {
  /**
   * Inserts a weather snapshot into MongoDB.
   */
  async insertSnapshot(data) {
    try {
      const snapshot = new WeatherSnapshot(data);
      const saved = await snapshot.save();
      return saved._id;
    } catch (err) {
      logger.error({ err }, 'Failed to insert weather snapshot into MongoDB');
      throw err;
    }
  }

  /**
   * Retrieves the most recent weather snapshot from MongoDB.
   */
  async getLatest() {
    try {
      return await WeatherSnapshot.findOne()
        .sort({ queriedAt: -1 })
        .lean();
    } catch (err) {
      logger.error({ err }, 'Failed to retrieve latest weather snapshot from MongoDB');
      return null;
    }
  }
}

module.exports = WeatherQueries;
