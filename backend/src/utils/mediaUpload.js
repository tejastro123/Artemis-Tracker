const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { AppError, ValidationError } = require('./errors');

const MEDIA_TYPES = ['image', 'video', 'document', 'other'];
const MEDIA_FOLDERS = {
  image: 'images',
  video: 'videos',
  document: 'documents',
  other: 'others'
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.m4v']);
const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.csv', '.json',
  '.xml', '.ppt', '.pptx', '.xls', '.xlsx'
]);

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/json',
  'application/xml',
  'text/xml',
  'application/rtf'
]);

const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/ogg': '.ogg',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/xml': '.xml',
  'text/xml': '.xml'
};

const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

function sanitizeBaseName(fileName) {
  const raw = path.basename(fileName || 'upload', path.extname(fileName || ''));
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return sanitized || 'upload';
}

function normalizeBase64(data) {
  if (typeof data !== 'string') {
    throw new ValidationError('Uploaded file data must be a base64 string');
  }

  return data.replace(/^data:[^;]+;base64,/, '').trim();
}

function resolveExtension(fileName, mimeType) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext) return ext;
  return MIME_EXTENSION_MAP[(mimeType || '').toLowerCase()] || '';
}

function validateUploadType(type, mimeType, extension) {
  const normalizedMime = (mimeType || '').toLowerCase();

  if (type === 'image') {
    if (!normalizedMime.startsWith('image/') && !IMAGE_EXTENSIONS.has(extension)) {
      throw new ValidationError('Image uploads must be an image file');
    }
    return;
  }

  if (type === 'video') {
    if (!normalizedMime.startsWith('video/') && !VIDEO_EXTENSIONS.has(extension)) {
      throw new ValidationError('Video uploads must be an .mp4, .webm, .ogg, or other video file');
    }
    return;
  }

  if (type === 'document') {
    if (
      !normalizedMime.startsWith('text/') &&
      !DOCUMENT_MIME_TYPES.has(normalizedMime) &&
      !DOCUMENT_EXTENSIONS.has(extension)
    ) {
      throw new ValidationError('Document uploads must be a supported PDF, doc, spreadsheet, presentation, or text file');
    }
  }
}

function createStoredFileName(fileName, extension) {
  const safeBase = sanitizeBaseName(fileName);
  const unique = crypto.randomUUID().slice(0, 8);
  return `${Date.now()}-${safeBase}-${unique}${extension}`;
}

function validatePublicOrRemoteUrl(url, fieldName) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new ValidationError(`${fieldName} is required`);
  }

  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed) && !/^\/public\//i.test(trimmed)) {
    throw new ValidationError(`${fieldName} must start with http://, https://, or /public/`);
  }

  return trimmed;
}

async function persistUpload({ type, upload }) {
  if (!upload || typeof upload !== 'object') {
    throw new ValidationError('Upload details are required');
  }

  const fileName = upload.fileName || upload.filename || upload.originalName;
  const mimeType = (upload.mimeType || upload.type || '').trim();
  const base64 = normalizeBase64(upload.dataBase64 || upload.data || upload.base64);

  if (!fileName) {
    throw new ValidationError('Uploaded file name is required');
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (err) {
    throw new ValidationError('Uploaded file is not valid base64 data');
  }

  if (!buffer.length) {
    throw new ValidationError('Uploaded file is empty');
  }

  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new AppError(`Upload exceeds the ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))} MB limit`, 413);
  }

  const extension = resolveExtension(fileName, mimeType);
  validateUploadType(type, mimeType, extension);

  const folderName = MEDIA_FOLDERS[type] || MEDIA_FOLDERS.other;
  const destinationDir = path.join(__dirname, '..', '..', 'public', 'media', folderName);
  const storedFileName = createStoredFileName(fileName, extension);

  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, storedFileName), buffer);

  return {
    url: `/public/media/${folderName}/${storedFileName}`,
    sourceType: 'upload',
    mimeType: mimeType || undefined,
    originalName: path.basename(fileName),
    sizeBytes: buffer.length
  };
}

module.exports = {
  MEDIA_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  persistUpload,
  validatePublicOrRemoteUrl
};
