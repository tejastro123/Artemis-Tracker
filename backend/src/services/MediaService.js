const MediaItem = require('../db/models/MediaItem');
const logger = require('../utils/logger');
const { AppError, ValidationError } = require('../utils/errors');
const {
  MEDIA_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  persistUpload,
  validatePublicOrRemoteUrl
} = require('../utils/mediaUpload');

const FALLBACK_MEDIA_ITEMS = [
  {
    title: 'Artemis II Launch Visual',
    type: 'image',
    url: 'img/artemis-ii-launch.jpg',
    category: 'Launch',
    description: 'Featured launch artwork used across the Artemis Tracker experience.',
    createdAt: new Date('2026-04-01T22:35:12Z')
  },
  {
    title: 'NASA Artemis II Live Coverage',
    type: 'video',
    url: 'https://www.youtube.com/watch?v=m3kR2KK8TEs',
    thumbnailUrl: 'https://img.youtube.com/vi/m3kR2KK8TEs/hqdefault.jpg',
    category: 'Coverage',
    description: 'Continuous mission coverage and communications stream for Artemis II.',
    createdAt: new Date('2026-04-01T22:35:12Z')
  }
];

const IMPORTANT_LINKS = [
  {
    title: 'Tracker Dashboard',
    url: 'index.html',
    description: 'Jump back to the live telemetry dashboard and mission timeline.',
    group: 'Project',
    external: false
  },
  {
    title: 'Data Sources',
    url: 'sources.html',
    description: 'Review every telemetry, news, and mission-data source used in the project.',
    group: 'Project',
    external: false
  },
  {
    title: 'NASA Artemis II Mission',
    url: 'https://www.nasa.gov/artemis-ii',
    description: 'Official NASA mission overview, crew details, and mission background.',
    group: 'Official',
    external: true
  },
  {
    title: 'NASA Track Artemis',
    url: 'https://www.nasa.gov/trackartemis',
    description: 'NASA public real-time tracking page for Orion during Artemis II.',
    group: 'Official',
    external: true
  },
  {
    title: 'Artemis II Media Resources',
    url: 'https://www.nasa.gov/artemis-ii-media-resources/',
    description: 'Official press kit, multimedia, mission resources, and crew assets.',
    group: 'Media',
    external: true
  },
  {
    title: 'AROW Community Relay',
    url: 'https://artemis.cdnspace.ca/',
    description: 'Community relay for AROW, orbital telemetry, DSN, and mission timeline feeds.',
    group: 'Telemetry',
    external: true
  },
  {
    title: 'NASA DSN Now',
    url: 'https://eyes.nasa.gov/dsn/dsn.html',
    description: 'Live Deep Space Network visualizer and real-time antenna activity.',
    group: 'Telemetry',
    external: true
  },
  {
    title: 'JPL Horizons',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
    description: 'Reference ephemeris service used for orbital fallback calculations.',
    group: 'Telemetry',
    external: true
  }
];

class MediaService {
  async getMediaHubData() {
    const { items, usingFallbackMedia } = await this._getMediaItems();
    const normalizedItems = items.map(item => this._normalizeItem(item));

    return {
      items: normalizedItems,
      images: normalizedItems.filter(item => item.type === 'image'),
      videos: normalizedItems.filter(item => item.type === 'video'),
      documents: normalizedItems.filter(item => item.type === 'document'),
      others: normalizedItems.filter(item => item.type === 'other'),
      importantLinks: IMPORTANT_LINKS,
      supportedTypes: MEDIA_TYPES,
      maxUploadSizeBytes: MAX_UPLOAD_SIZE_BYTES,
      usingFallbackMedia,
      generatedAt: new Date().toISOString()
    };
  }

  async createMediaItem(input = {}) {
    if (MediaItem.db.readyState !== 1) {
      throw new AppError('Media database is unavailable right now', 503);
    }

    const title = this._requireTrimmedString(input.title, 'Title');
    const type = this._requireMediaType(input.type);
    const description = this._optionalTrimmedString(input.description);
    const category = this._optionalTrimmedString(input.category) || 'mission';
    const thumbnailUrl = input.thumbnailUrl
      ? validatePublicOrRemoteUrl(input.thumbnailUrl, 'Thumbnail URL')
      : undefined;

    const stored = input.upload
      ? await persistUpload({ type, upload: input.upload })
      : {
          url: validatePublicOrRemoteUrl(input.url, 'Media URL'),
          sourceType: 'url'
        };

    const created = await MediaItem.create({
      title,
      type,
      url: stored.url,
      thumbnailUrl,
      sourceType: stored.sourceType,
      mimeType: stored.mimeType,
      originalName: stored.originalName,
      sizeBytes: stored.sizeBytes,
      category,
      description
    });

    return this._normalizeItem(created.toObject());
  }

  async _getMediaItems() {
    if (MediaItem.db.readyState !== 1) {
      logger.warn('Media DB not connected, using fallback media items');
      return { items: FALLBACK_MEDIA_ITEMS, usingFallbackMedia: true };
    }

    try {
      const mediaItems = await MediaItem.find().sort({ createdAt: -1 }).lean();

      if (!mediaItems.length) {
        logger.info('Media collection is empty, using fallback media items');
        return { items: FALLBACK_MEDIA_ITEMS, usingFallbackMedia: true };
      }

      return { items: mediaItems, usingFallbackMedia: false };
    } catch (err) {
      logger.error({ err }, 'Error fetching media items, using fallback media');
      return { items: FALLBACK_MEDIA_ITEMS, usingFallbackMedia: true };
    }
  }

  _normalizeItem(item) {
    const normalized = { ...item };

    if (typeof normalized.url === 'string' && normalized.url.includes('drive.google.com')) {
      normalized.isDrive = true;
    }

    if (normalized.createdAt instanceof Date) {
      normalized.createdAt = normalized.createdAt.toISOString();
    }

    if (normalized.updatedAt instanceof Date) {
      normalized.updatedAt = normalized.updatedAt.toISOString();
    }

    if (normalized._id && typeof normalized._id !== 'string') {
      normalized._id = String(normalized._id);
    }

    return normalized;
  }

  _optionalTrimmedString(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
  }

  _requireTrimmedString(value, fieldName) {
    const normalized = this._optionalTrimmedString(value);
    if (!normalized) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return normalized;
  }

  _requireMediaType(value) {
    const normalized = this._optionalTrimmedString(value).toLowerCase();
    if (!MEDIA_TYPES.includes(normalized)) {
      throw new ValidationError(`Type must be one of: ${MEDIA_TYPES.join(', ')}`);
    }
    return normalized;
  }
}

module.exports = new MediaService();
