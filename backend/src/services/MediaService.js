const MediaItem = require('../db/models/MediaItem');
const logger = require('../utils/logger');

/**
 * Handles the merging of local filesystem media and Google Drive hosted media.
 */
class MediaService {
  /**
   * Retrieves all media from the database (which now includes your Google Drive links).
   */
  async getAllMedia() {
    try {
      // Fetch all items from the DB sorted by date.
      const mediaItems = await MediaItem.find().sort({ createdAt: -1 });
      
      // Mark Drive items as external so the frontend knows what to do
      return mediaItems.map(item => {
        const plainItem = item.toObject();
        if (plainItem.url.includes('drive.google.com')) {
          plainItem.isDrive = true;
        }
        return plainItem;
      });
    } catch (err) {
      logger.error({ err }, 'Error fetching media items');
      throw err;
    }
  }
}

module.exports = new MediaService();
