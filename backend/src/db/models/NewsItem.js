const mongoose = require('mongoose');

const newsItemSchema = new mongoose.Schema({
  url: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  summary: String,
  source: String,
  publishedAt: Date,
  fetchedAt: { type: Date, default: Date.now },
  relevanceScore: { type: Number, default: 1 }
}, { timestamps: true });

// Index for latest news retrieval
newsItemSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('NewsItem', newsItemSchema);
