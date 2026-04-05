const mongoose = require('mongoose');
const MediaItem = require('../src/db/models/MediaItem');
const config = require('../src/config');
const logger = require('../src/utils/logger');

// Usage: node scripts/add_drive_media.js "Title" "Type(image/video)" "DriveLink" "Description"
async function addDriveMedia() {
  const [title, type, url, description] = process.argv.slice(2);

  if (!title || !type || !url) {
    console.log('Usage: node scripts/add_drive_media.js "Title" "image|video" "DriveURL" ["Description"]');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.MONGODB.URI);
    logger.info('Connected to MongoDB for adding Drive media...');

    const newItem = new MediaItem({
      title,
      type,
      url,
      description: description || 'Hosted on Google Drive',
      category: 'drive'
    });

    await newItem.save();
    logger.info(`Successfully added "${title}" to the database!`);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error adding Drive media');
    process.exit(1);
  }
}

addDriveMedia();
