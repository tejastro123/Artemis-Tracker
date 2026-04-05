const mongoose = require('mongoose');

const telemetrySnapshotSchema = new mongoose.Schema({
  metHours: { type: Number, required: true },
  distEarthKm: Number,
  distMoonKm: Number,
  speedKmh: Number,
  altitudeKm: Number,
  source: { type: String, required: true },
  capturedAt: { type: Date, default: Date.now },
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Index for fast historical lookups (sparklines)
telemetrySnapshotSchema.index({ capturedAt: -1 });

module.exports = mongoose.model('TelemetrySnapshot', telemetrySnapshotSchema);
