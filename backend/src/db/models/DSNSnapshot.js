const mongoose = require('mongoose');

const dsnSnapshotSchema = new mongoose.Schema({
  orionDishes: [{
    dish: String,
    station: String,
    signal: String,
    bands: [String],
    dataRateBps: Number,
    rtltSeconds: Number,
    rangeKm: Number,
    azDeg: Number,
    elDeg: Number,
    targets: Array
  }],
  source: String,
  updatedAt: { type: Date, default: Date.now },
  raw: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model('DSNSnapshot', dsnSnapshotSchema);
