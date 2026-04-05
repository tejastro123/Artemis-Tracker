const logger = require('../../utils/logger');
const DSNSnapshot = require('../models/DSNSnapshot');

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
      logger.error({ err }, 'Failed to insert DSN snapshot into MongoDB');
      throw err;
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
      logger.error({ err }, 'Failed to retrieve latest DSN snapshot from MongoDB');
      return null;
    }
  }
}

module.exports = DSNQueries;
