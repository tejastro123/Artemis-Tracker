const mongoose = require('mongoose');

const weatherSnapshotSchema = new mongoose.Schema({
  flares: Array,
  cme: Array,
  storms: Array,
  sep: Array,
  summary: {
    status: String,
    highestFlare: String,
    highestKp: Number,
    flareCount: Number,
    cmeCount: Number,
    stormCount: Number,
    sepCount: Number,
    latestFlare: Object,
    earthDirectedCMEs: Array
  },
  queriedAt: { type: Date, default: Date.now },
  raw: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('WeatherSnapshot', weatherSnapshotSchema);
