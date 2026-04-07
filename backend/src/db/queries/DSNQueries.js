const logger = require('../../utils/logger');
const DSNSnapshot = require('../models/DSNSnapshot');
const { InternalServerError } = require('../../utils/errors');

class DSNQueries {
  /**
   * Inserts a DSN snapshot into MongoDB.
   */
  async insertSnapshot(data) {
    try {
      const snapshot = new DSNSnapshot(data);
      const saved = await snapshot.save();
      return saved._id;
    } catch (err) {
      logger.error({ err }, 'Database: Failed to insert DSN snapshot');
      throw new InternalServerError('Failed to save DSN data');
    }
  }

  /**
   * Retrieves the most recent DSN snapshot from MongoDB.
   */
  async getLatest() {
    try {
      return await DSNSnapshot.findOne()
        .sort({ updatedAt: -1 })
        .lean();
    } catch (err) {
      logger.error({ err }, 'Database: Failed to retrieve latest DSN snapshot');
      return null;
    }
  }
}

module.exports = DSNQueries;
