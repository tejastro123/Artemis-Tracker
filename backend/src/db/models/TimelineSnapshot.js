const mongoose = require('mongoose');

const timelineSnapshotSchema = new mongoose.Schema({
  activities: [Object], // [ { timestamp, title, description, phase, type } ]
  source: { type: String, default: 'community-timeline' },
  capturedAt: { type: Date, default: Date.now },
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

timelineSnapshotSchema.index({ capturedAt: -1 });

module.exports = mongoose.model('TimelineSnapshot', timelineSnapshotSchema);
