const TimelineSnapshot = require('../models/TimelineSnapshot');

class TimelineQueries {
  async getLatest() {
    return await TimelineSnapshot.findOne().sort({ capturedAt: -1 }).lean();
  }

  async insertSnapshot(data) {
    const snapshot = new TimelineSnapshot(data);
    return await snapshot.save();
  }

  async getHistory(limit = 100) {
    return await TimelineSnapshot.find().sort({ capturedAt: -1 }).limit(limit).lean();
  }
}

module.exports = new TimelineQueries();
