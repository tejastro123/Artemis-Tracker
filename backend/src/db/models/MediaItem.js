const mongoose = require('mongoose');

const mediaItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['image', 'video', 'document', 'other'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String
  },
  sourceType: {
    type: String,
    enum: ['url', 'upload'],
    default: 'url'
  },
  mimeType: {
    type: String
  },
  originalName: {
    type: String
  },
  sizeBytes: {
    type: Number
  },
  category: {
    type: String,
    default: 'mission'
  },
  description: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MediaItem', mediaItemSchema);
