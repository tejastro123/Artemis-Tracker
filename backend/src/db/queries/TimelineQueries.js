const logger = require('../../utils/logger');
const TimelineSnapshot = require('../models/TimelineSnapshot');
const { InternalServerError } = require('../../utils/errors');

class TimelineQueries {
  async getLatest() {
    try {
      return await TimelineSnapshot.findOne().sort({ capturedAt: -1 }).lean();
    } catch (err) {
      logger.error({ err }, 'Database: Failed to retrieve latest timeline');
      return null;
    }
  }

  async insertSnapshot(data) {
    try {
      const snapshot = new TimelineSnapshot(data);
      return await snapshot.save();
    } catch (err) {
      logger.error({ err }, 'Database: Failed to insert timeline snapshot');
      throw new InternalServerError('Failed to save timeline data');
    }
  }

  async getHistory(limit = 100) {
    try {
      return await TimelineSnapshot.find().sort({ capturedAt: -1 }).limit(limit).lean();
    } catch (err) {
      logger.error({ err, limit }, 'Database: Failed to retrieve timeline history');
      return [];
    }
  }
}

module.exports = new TimelineQueries();
