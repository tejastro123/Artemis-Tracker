const logger = require('../../utils/logger');
const TelemetrySnapshot = require('../models/TelemetrySnapshot');
const { InternalServerError } = require('../../utils/errors');

class TelemetryQueries {
  /**
   * Inserts a telemetry snapshot into MongoDB.
   */
  async insertSnapshot(telemetry) {
    try {
      const snapshot = new TelemetrySnapshot({
        metHours: telemetry.metHours,
        distEarthKm: telemetry.distEarthKm,
        distMoonKm: telemetry.distMoonKm,
        speedKmh: telemetry.speedKmh,
        altitudeKm: telemetry.altitudeKm,
        source: telemetry._source || 'unknown',
        raw: telemetry
      });
      const saved = await snapshot.save();
      return saved._id;
    } catch (err) {
      logger.error({ err, telemetry }, 'Database: Failed to insert telemetry snapshot');
      throw new InternalServerError('Failed to save telemetry data');
    }
  }

  /**
   * Retrieves telemetry history from MongoDB.
   */
  async getHistory(hours = 2) {
    try {
      const startTime = new Date(Date.now() - (hours * 3600000));
      const history = await TelemetrySnapshot.find({
        capturedAt: { $gte: startTime }
      }).sort({ capturedAt: 1 }).lean();
      
      return history.map(h => ({
        met_hours: h.metHours,
        speed_kmh: h.speedKmh,
        dist_earth_km: h.distEarthKm,
        captured_at: h.capturedAt
      }));
    } catch (err) {
      logger.error({ err, hours }, 'Database: Failed to retrieve telemetry history');
      return [];
    }
  }
}

module.exports = TelemetryQueries;
