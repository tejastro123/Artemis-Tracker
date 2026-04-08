/**
 * Artemis II Media Center
 * Images, videos, documents, latest news, and login-gated admin media posting.
 */

(function () {
  'use strict';

  var BACKEND_BASE = (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('192.168.'))
    ? 'http://localhost:3001'
    : 'https://artemis-tracker-mzav.onrender.com';

  var API_BASE = BACKEND_BASE + '/api/v1';
  var MEDIA_API_URL = API_BASE + '/media';
  var NEWS_API_URL = API_BASE + '/news?limit=6';
  var TELEMETRY_API_URL = API_BASE + '/telemetry';
  var ADMIN_LOGIN_URL = MEDIA_API_URL + '/admin/login';
  var ADMIN_SESSION_URL = MEDIA_API_URL + '/admin/session';
  var ADMIN_SESSION_TOKEN_STORAGE_KEY = 'artemisTracker.adminSessionToken';
  var uploadLimitBytes = 25 * 1024 * 1024;

  var dom = {};

  function cacheDom() {
    dom = {
      dataStatus: document.getElementById('data-status'),
      mediaFeedStatus: document.getElementById('media-feed-status'),
      mediaGeneratedAt: document.getElementById('media-generated-at'),
      images: document.getElementById('media-images'),
      videos: document.getElementById('media-videos'),
      documents: document.getElementById('media-documents'),
      other: document.getElementById('media-other'),
      news: document.getElementById('media-news-list'),
      links: document.getElementById('important-links'),
      countImages: document.getElementById('media-count-images'),
      countVideos: document.getElementById('media-count-videos'),
      countDocuments: document.getElementById('media-count-documents'),
      countOther: document.getElementById('media-count-other'),
      countNews: document.getElementById('media-count-news'),
      countLinks: document.getElementById('media-count-links'),
      adminLoginPanel: document.getElementById('admin-login-panel'),
      adminConsolePanel: document.getElementById('admin-console-panel'),
      adminLoginForm: document.getElementById('media-admin-login-form'),
      adminPassword: document.getElementById('admin-password'),
      adminLoginSubmit: document.getElementById('admin-login-submit'),
      adminLoginStatus: document.getElementById('admin-login-status'),
      adminSessionStatus: document.getElementById('admin-session-status'),
      adminLogout: document.getElementById('admin-logout'),
      adminForm: document.getElementById('media-admin-form'),
      adminType: document.getElementById('admin-type'),
      adminTitle: document.getElementById('admin-title'),
      adminCategory: document.getElementById('admin-category'),
      adminUrl: document.getElementById('admin-url'),
      adminFile: document.getElementById('admin-file'),
      adminThumbnailUrl: document.getElementById('admin-thumbnail-url'),
      adminDescription: document.getElementById('admin-description'),
      adminModeUrl: document.getElementById('admin-mode-url'),
      adminModeUpload: document.getElementById('admin-mode-upload'),
      adminUrlRow: document.getElementById('admin-url-row'),
      adminFileRow: document.getElementById('admin-file-row'),
      adminSubmit: document.getElementById('admin-submit'),
      adminStatus: document.getElementById('admin-status')
    };
  }

  function init() {
    cacheDom();
    setupSkipNav();
    setupNavToggle();
    setupAdminAccess();
    setupAdminConsole();
    fetchTelemetryStatus();
    fetchMediaHub();
    fetchLatestNews();

    setInterval(fetchTelemetryStatus, 30000);
    setInterval(fetchLatestNews, 300000);
  }

  function fetchJson(url, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 10000);

    return fetch(url, { signal: controller.signal }).then(function (resp) {
      clearTimeout(timer);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function fetchTelemetryStatus() {
    fetchJson(TELEMETRY_API_URL, 10000)
      .then(function (data) {
        updateTelemetryStatus(data);
      })
      .catch(function () {
        // Keep the existing badge text if telemetry is unavailable on this page.
      });
  }

  function updateTelemetryStatus(data) {
    if (!dom.dataStatus || !data) return;

    var source = data._source || 'prelaunch';

    if (source === 'live' || source === 'community-consolidated' || source === 'horizons') {
      dom.dataStatus.textContent = source === 'horizons'
        ? 'Live orbital data via JPL Horizons'
        : 'Real-time orbital data via AROW';
      dom.dataStatus.className = 'data-status data-status--live';
      return;
    }

    if (source === 'mock') {
      dom.dataStatus.textContent = 'Simulated data (AROW unavailable)';
      dom.dataStatus.className = 'data-status data-status--mock';
      return;
    }

    dom.dataStatus.textContent = 'Pre-launch - data available after liftoff';
    dom.dataStatus.className = 'data-status data-status--prelaunch';
  }

  function fetchMediaHub() {
    if (dom.images) dom.images.innerHTML = '<p class="media-empty">Loading image archive...</p>';
    if (dom.videos) dom.videos.innerHTML = '<p class="media-empty">Loading video archive...</p>';
    if (dom.documents) dom.documents.innerHTML = '<p class="media-empty">Loading document archive...</p>';
    if (dom.other) dom.other.innerHTML = '<p class="media-empty">Loading additional files...</p>';
    if (dom.links) dom.links.innerHTML = '<p class="media-empty">Loading mission links...</p>';

    fetchJson(MEDIA_API_URL, 12000)
      .then(function (payload) {
        renderMediaHub(payload);
      })
      .catch(function (err) {
        console.error('Media hub fetch failed:', err.message);
        renderMediaError();
      });
  }

  function renderMediaHub(payload) {
    var items = Array.isArray(payload) ? payload : (payload.items || []);
    var images = Array.isArray(payload.images) ? payload.images : filterMedia(items, 'image');
    var videos = Array.isArray(payload.videos) ? payload.videos : filterMedia(items, 'video');
    var documents = Array.isArray(payload.documents) ? payload.documents : filterMedia(items, 'document');
    var others = Array.isArray(payload.others) ? payload.others : filterMedia(items, 'other');
    var links = Array.isArray(payload.importantLinks) ? payload.importantLinks : [];

    if (typeof payload.maxUploadSizeBytes === 'number' && payload.maxUploadSizeBytes > 0) {
      uploadLimitBytes = payload.maxUploadSizeBytes;
    }

    renderMediaCards(dom.images, images, 'image');
    renderMediaCards(dom.videos, videos, 'video');
    renderMediaCards(dom.documents, documents, 'document');
    renderMediaCards(dom.other, others, 'other');
    renderImportantLinks(links);

    setCount(dom.countImages, images.length);
    setCount(dom.countVideos, videos.length);
    setCount(dom.countDocuments, documents.length);
    setCount(dom.countOther, others.length);
    setCount(dom.countLinks, links.length);

    if (dom.mediaFeedStatus) {
      dom.mediaFeedStatus.textContent = payload.usingFallbackMedia
        ? 'Using bundled fallback media while the database is empty or temporarily unavailable.'
        : 'Connected to the live admin-managed media catalog.';
      dom.mediaFeedStatus.className = payload.usingFallbackMedia
        ? 'media-status media-status--warning'
        : 'media-status media-status--live';
    }

    if (dom.mediaGeneratedAt && payload.generatedAt) {
      dom.mediaGeneratedAt.textContent = 'Updated ' + formatRelativeTime(payload.generatedAt);
    }
  }

  function filterMedia(items, type) {
    return items.filter(function (item) {
      return item.type === type;
    });
  }

  function renderMediaError() {
    var errorText = '<p class="media-empty">Unable to load this section right now.</p>';
    if (dom.images) dom.images.innerHTML = errorText;
    if (dom.videos) dom.videos.innerHTML = errorText;
    if (dom.documents) dom.documents.innerHTML = errorText;
    if (dom.other) dom.other.innerHTML = errorText;
    if (dom.links) dom.links.innerHTML = errorText;
    if (dom.mediaFeedStatus) {
      dom.mediaFeedStatus.textContent = 'Media hub unavailable right now.';
      dom.mediaFeedStatus.className = 'media-status media-status--warning';
    }
  }

  function renderMediaCards(container, items, type) {
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = '<p class="media-empty">' + getEmptyStateMessage(type) + '</p>';
      return;
    }

    container.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      container.appendChild(createMediaCard(items[i], type));
    }
  }

  function getEmptyStateMessage(type) {
    if (type === 'image') return 'No images available yet.';
    if (type === 'video') return 'No videos available yet.';
    if (type === 'document') return 'No documents available yet.';
    return 'No additional files available yet.';
  }

  function createMediaCard(item, type) {
    var card = document.createElement('article');
    card.className = 'media-card';

    var badge = document.createElement('span');
    badge.className = 'media-card__badge';
    badge.textContent = getBadgeLabel(type);
    card.appendChild(badge);

    var mediaFrame = document.createElement('div');
    mediaFrame.className = 'media-card__media';
    mediaFrame.appendChild(createMediaElement(item, type));
    card.appendChild(mediaFrame);

    var body = document.createElement('div');
    body.className = 'media-card__body';

    var category = document.createElement('p');
    category.className = 'media-card__category';
    category.textContent = item.category || 'Mission';
    body.appendChild(category);

    var title = document.createElement('h3');
    title.className = 'media-card__title';
    title.textContent = item.title || getDefaultTitle(type);
    body.appendChild(title);

    if (item.description) {
      var desc = document.createElement('p');
      desc.className = 'media-card__description';
      desc.textContent = item.description;
      body.appendChild(desc);
    }

    var footer = document.createElement('div');
    footer.className = 'media-card__footer';

    var timestamp = document.createElement('span');
    timestamp.className = 'media-card__timestamp';
    timestamp.textContent = item.createdAt ? formatRelativeTime(item.createdAt) : 'Mission asset';
    footer.appendChild(timestamp);

    var action = document.createElement('a');
    action.className = 'media-card__action';
    action.href = resolveMediaHref(item.url);
    action.target = '_blank';
    action.rel = 'noopener noreferrer';
    action.textContent = getActionLabel(type);
    footer.appendChild(action);

    body.appendChild(footer);
    card.appendChild(body);

    return card;
  }

  function getBadgeLabel(type) {
    if (type === 'image') return 'Image';
    if (type === 'video') return 'Video';
    if (type === 'document') return 'Document';
    return 'File';
  }

  function getDefaultTitle(type) {
    if (type === 'image') return 'Mission image';
    if (type === 'video') return 'Mission video';
    if (type === 'document') return 'Mission document';
    return 'Mission file';
  }

  function getActionLabel(type) {
    if (type === 'image') return 'Open image';
    if (type === 'video') return 'Watch video';
    if (type === 'document') return 'Open document';
    return 'Open file';
  }

  function createMediaElement(item, type) {
    if (type === 'image') {
      return createImageElement(item);
    }

    if (type === 'video') {
      return createVideoElement(item);
    }

    return createFileElement(item, type);
  }

  function createImageElement(item) {
    var img = document.createElement('img');
    img.className = 'media-card__image';
    img.loading = 'lazy';
    img.alt = item.title || 'Artemis II mission image';
    img.src = resolvePreviewImage(item) || 'img/artemis-ii-launch.jpg';
    return img;
  }

  function createVideoElement(item) {
    var youtubeId = getYouTubeId(item.url);
    if (youtubeId) {
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube.com/embed/' + youtubeId;
      frame.loading = 'lazy';
      frame.title = item.title || 'Artemis II mission video';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      return frame;
    }

    var driveId = getDriveId(item.url);
    if (driveId) {
      var driveFrame = document.createElement('iframe');
      driveFrame.src = 'https://drive.google.com/file/d/' + driveId + '/preview';
      driveFrame.loading = 'lazy';
      driveFrame.title = item.title || 'Artemis II mission video';
      driveFrame.allow = 'autoplay';
      return driveFrame;
    }

    var href = resolveMediaHref(item.url);
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(href)) {
      var video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.poster = resolvePreviewImage(item) || 'img/artemis-ii-launch.jpg';
      video.src = href;
      return video;
    }

    return createFileElement(item, 'video');
  }

  function createFileElement(item, type) {
    if (item.thumbnailUrl) {
      var img = document.createElement('img');
      img.className = 'media-card__image';
      img.loading = 'lazy';
      img.alt = item.title || getDefaultTitle(type);
      img.src = resolveAssetPath(item.thumbnailUrl);
      return img;
    }

    var placeholder = document.createElement('div');
    placeholder.className = 'media-card__placeholder';

    var ext = document.createElement('span');
    ext.className = 'media-card__placeholder-ext';
    ext.textContent = getFileExtensionLabel(item, type);
    placeholder.appendChild(ext);

    var label = document.createElement('span');
    label.className = 'media-card__placeholder-label';
    label.textContent = type === 'document' ? 'Document Ready' : 'File Ready';
    placeholder.appendChild(label);

    return placeholder;
  }

  function getFileExtensionLabel(item, type) {
    var source = item.originalName || item.url || '';
    var match = String(source).match(/\.([a-z0-9]{1,6})(?:[?#].*)?$/i);
    if (match) return match[1].toUpperCase();

    if (item.url && item.url.indexOf('drive.google.com') !== -1) {
      return 'DRIVE';
    }

    return type === 'document' ? 'DOC' : 'FILE';
  }

  function resolvePreviewImage(item) {
    if (item.thumbnailUrl) {
      return resolveAssetPath(item.thumbnailUrl);
    }

    if (item.url && item.url.includes('drive.google.com') && item.type === 'image') {
      var driveId = getDriveId(item.url);
      if (driveId) return 'https://drive.google.com/uc?export=view&id=' + driveId;
    }

    if (item.type === 'video') {
      var youtubeId = getYouTubeId(item.url);
      if (youtubeId) return 'https://img.youtube.com/vi/' + youtubeId + '/hqdefault.jpg';
      return 'img/artemis-ii-launch.jpg';
    }

    if (item.type === 'image') {
      return resolveAssetPath(item.url);
    }

    return '';
  }

  function resolveMediaHref(url) {
    if (!url) return '#';
    if (/^https?:\/\//i.test(url)) return url;
    return resolveAssetPath(url);
  }

  function resolveAssetPath(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('img/') === 0 || url.indexOf('/img/') === 0) return url;
    return BACKEND_BASE + (url.charAt(0) === '/' ? '' : '/') + url;
  }

  function getYouTubeId(url) {
    if (!url) return '';

    var patterns = [
      /youtube\.com\/watch\?v=([^&]+)/i,
      /youtube\.com\/embed\/([^?&/]+)/i,
      /youtu\.be\/([^?&/]+)/i
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match = url.match(patterns[i]);
      if (match) return match[1];
    }

    return '';
  }

  function getDriveId(url) {
    if (!url) return '';

    var match = url.match(/\/d\/([^\/?]+)/) || url.match(/[?&]id=([^&]+)/);
    return match ? match[1] : '';
  }

  function fetchLatestNews() {
    if (dom.news) dom.news.innerHTML = '<p class="media-empty">Loading latest mission coverage...</p>';

    fetchJson(NEWS_API_URL, 15000)
      .then(function (data) {
        var items = data && data.items ? data.items : [];
        renderNews(items);
        setCount(dom.countNews, items.length);
      })
      .catch(function (err) {
        console.error('News fetch failed:', err.message);
        if (dom.news) {
          dom.news.innerHTML = '<p class="media-empty">Unable to load the latest news right now.</p>';
        }
        setCount(dom.countNews, 0);
      });
  }

  function renderNews(items) {
    if (!dom.news) return;

    if (!items || !items.length) {
      dom.news.innerHTML = '<p class="media-empty">No recent updates available.</p>';
      return;
    }

    dom.news.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      dom.news.appendChild(createNewsCard(items[i], i + 1, items.length));
    }
  }

  function createNewsCard(item, position, total) {
    var article = document.createElement('article');
    article.className = 'news-item';
    if (item.category === 'highlight') {
      article.classList.add('news-item--highlight');
    }
    article.setAttribute('aria-posinset', String(position));
    article.setAttribute('aria-setsize', String(total));

    var heading = document.createElement('h3');
    heading.className = 'news-item__title';
    var link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    heading.appendChild(link);
    article.appendChild(heading);

    var meta = document.createElement('div');
    meta.className = 'news-item__meta';

    var date = document.createElement('time');
    date.className = 'news-item__date';
    date.dateTime = item.date;
    date.textContent = formatRelativeTime(item.date);
    meta.appendChild(date);

    if (item.source) {
      meta.appendChild(document.createTextNode(' - '));
      var source = document.createElement('span');
      source.className = item.category === 'highlight'
        ? 'news-item__source-badge'
        : 'news-item__source';
      source.textContent = item.source;
      meta.appendChild(source);
    }

    article.appendChild(meta);

    if (item.summary) {
      var summary = document.createElement('p');
      summary.className = 'news-item__summary';
      summary.textContent = item.summary;
      article.appendChild(summary);
    }

    return article;
  }

  function renderImportantLinks(items) {
    if (!dom.links) return;

    if (!items || !items.length) {
      dom.links.innerHTML = '<p class="media-empty">No important links configured yet.</p>';
      return;
    }

    dom.links.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      dom.links.appendChild(createLinkCard(items[i]));
    }
  }

  function createLinkCard(item) {
    var card = document.createElement('article');
    card.className = 'link-card';

    var group = document.createElement('p');
    group.className = 'link-card__group';
    group.textContent = item.group || 'Resource';
    card.appendChild(group);

    var title = document.createElement('h3');
    title.className = 'link-card__title';
    title.textContent = item.title;
    card.appendChild(title);

    var desc = document.createElement('p');
    desc.className = 'link-card__description';
    desc.textContent = item.description || 'Open mission resource';
    card.appendChild(desc);

    var action = document.createElement('a');
    action.className = 'link-card__action';
    action.href = item.url;
    action.textContent = item.external === false ? 'Open page' : 'Open resource';
    if (item.external !== false) {
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
    }
    card.appendChild(action);

    return card;
  }

  function setupAdminAccess() {
    if (!dom.adminLoginForm) return;

    dom.adminLoginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitAdminLogin();
    });

    if (dom.adminLogout) {
      dom.adminLogout.addEventListener('click', function () {
        clearStoredAdminToken();
        renderAdminSignedOut('Signed out. Sign in again to access the admin console.', 'info');
      });
    }

    restoreAdminSession();
  }

  function setupAdminConsole() {
    if (!dom.adminForm) return;

    if (dom.adminModeUrl) {
      dom.adminModeUrl.addEventListener('change', toggleAdminMode);
    }

    if (dom.adminModeUpload) {
      dom.adminModeUpload.addEventListener('change', toggleAdminMode);
    }

    if (dom.adminFile) {
      dom.adminFile.addEventListener('change', handleAdminFileSelection);
    }

    dom.adminForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitAdminForm();
    });

    toggleAdminMode();
  }

  function restoreAdminSession() {
    var token = getStoredAdminToken();

    if (!token) {
      renderAdminSignedOut('Sign in to reveal the admin posting console.', 'info');
      return;
    }

    setAdminLoginBusy(true);
    setAdminLoginStatus('Checking existing admin session...', 'info');

    fetch(ADMIN_SESSION_URL, {
      method: 'GET',
      headers: {
        'x-admin-token': token
      }
    })
      .then(function (response) {
        return parseJsonResponse(response);
      })
      .then(function (data) {
        renderAdminSignedIn(data.expiresAt);
      })
      .catch(function () {
        clearStoredAdminToken();
        renderAdminSignedOut('Admin session expired. Sign in again.', 'error');
      })
      .finally(function () {
        setAdminLoginBusy(false);
      });
  }

  function submitAdminLogin() {
    var password = dom.adminPassword ? dom.adminPassword.value.trim() : '';

    if (!password) {
      setAdminLoginStatus('Enter the admin password.', 'error');
      return;
    }

    setAdminLoginBusy(true);
    setAdminLoginStatus('Signing in...', 'info');

    fetch(ADMIN_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: password })
    })
      .then(function (response) {
        return parseJsonResponse(response);
      })
      .then(function (data) {
        storeAdminToken(data.token);
        if (dom.adminPassword) {
          dom.adminPassword.value = '';
        }
        renderAdminSignedIn(data.expiresAt);
      })
      .catch(function (err) {
        renderAdminSignedOut(err.message || 'Unable to sign in.', 'error');
      })
      .finally(function () {
        setAdminLoginBusy(false);
      });
  }

  function renderAdminSignedIn(expiresAt) {
    if (dom.adminLoginPanel) dom.adminLoginPanel.hidden = true;
    if (dom.adminConsolePanel) dom.adminConsolePanel.hidden = false;

    setAdminLoginStatus('Admin login active.', 'success');
    setAdminStatus('You are signed in. Submit a URL or upload a file to post media.', 'success');

    if (dom.adminSessionStatus) {
      dom.adminSessionStatus.textContent = 'Signed in as admin until ' + formatAdminExpiry(expiresAt) + '.';
      dom.adminSessionStatus.className = 'admin-status admin-status--success';
    }
  }

  function renderAdminSignedOut(message, tone) {
    if (dom.adminLoginPanel) dom.adminLoginPanel.hidden = false;
    if (dom.adminConsolePanel) dom.adminConsolePanel.hidden = true;
    setAdminLoginStatus(message || 'Sign in to reveal the admin posting console.', tone || 'info');
  }

  function setAdminLoginStatus(message, tone) {
    if (!dom.adminLoginStatus) return;
    dom.adminLoginStatus.textContent = message;
    dom.adminLoginStatus.className = 'admin-status' + (tone ? ' admin-status--' + tone : '');
  }

  function setAdminLoginBusy(isBusy) {
    if (dom.adminLoginSubmit) dom.adminLoginSubmit.disabled = isBusy;
    if (dom.adminPassword) dom.adminPassword.disabled = isBusy;
    if (dom.adminLoginSubmit) dom.adminLoginSubmit.textContent = isBusy ? 'Signing In...' : 'Sign In';
  }

  function getStoredAdminToken() {
    try {
      return window.sessionStorage.getItem(ADMIN_SESSION_TOKEN_STORAGE_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function storeAdminToken(token) {
    try {
      window.sessionStorage.setItem(ADMIN_SESSION_TOKEN_STORAGE_KEY, token);
    } catch (err) {
      // Ignore storage failures and keep the current page state.
    }
  }

  function clearStoredAdminToken() {
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_TOKEN_STORAGE_KEY);
    } catch (err) {
      // Ignore storage failures.
    }
  }

  function getAdminMode() {
    return dom.adminModeUpload && dom.adminModeUpload.checked ? 'upload' : 'url';
  }

  function toggleAdminMode() {
    var mode = getAdminMode();

    if (dom.adminUrlRow) dom.adminUrlRow.hidden = mode !== 'url';
    if (dom.adminFileRow) dom.adminFileRow.hidden = mode !== 'upload';
    if (dom.adminUrl) dom.adminUrl.required = mode === 'url';
    if (dom.adminFile) dom.adminFile.required = mode === 'upload';
    if (dom.adminSubmit) dom.adminSubmit.textContent = mode === 'upload' ? 'Upload Asset' : 'Post Asset';
  }

  function handleAdminFileSelection() {
    if (!dom.adminFile || !dom.adminFile.files || !dom.adminFile.files[0]) return;

    var file = dom.adminFile.files[0];

    if (dom.adminTitle && !dom.adminTitle.value.trim()) {
      dom.adminTitle.value = stripExtension(file.name);
    }

    if (dom.adminType) {
      dom.adminType.value = inferTypeFromFile(file);
    }
  }

  function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '');
  }

  function inferTypeFromFile(file) {
    var mimeType = (file.type || '').toLowerCase();
    var fileName = String(file.name || '').toLowerCase();

    if (mimeType.indexOf('image/') === 0) return 'image';
    if (mimeType.indexOf('video/') === 0) return 'video';
    if (/\.(pdf|doc|docx|txt|md|rtf|csv|json|xml|ppt|pptx|xls|xlsx)$/i.test(fileName)) return 'document';
    if (mimeType.indexOf('text/') === 0) return 'document';

    return 'other';
  }

  function setAdminStatus(message, tone) {
    if (!dom.adminStatus) return;
    dom.adminStatus.textContent = message;
    dom.adminStatus.className = 'admin-status' + (tone ? ' admin-status--' + tone : '');
  }

  function setAdminBusy(isBusy) {
    if (dom.adminSubmit) dom.adminSubmit.disabled = isBusy;
    if (dom.adminSubmit) dom.adminSubmit.textContent = isBusy
      ? (getAdminMode() === 'upload' ? 'Uploading...' : 'Posting...')
      : (getAdminMode() === 'upload' ? 'Upload Asset' : 'Post Asset');
  }

  function submitAdminForm() {
    var adminToken = getStoredAdminToken();
    if (!adminToken) {
      renderAdminSignedOut('Your admin session has ended. Sign in again.', 'error');
      return;
    }

    var mode = getAdminMode();
    setAdminBusy(true);
    setAdminStatus(mode === 'upload'
      ? 'Encoding file and sending upload...'
      : 'Posting new media item...', 'info');

    buildAdminPayload(mode)
      .then(function (payload) {
        return fetch(MEDIA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': adminToken
          },
          body: JSON.stringify(payload)
        });
      })
      .then(function (response) {
        return parseJsonResponse(response);
      })
      .then(function () {
        clearAdminFields();
        setAdminStatus('Media item saved. The catalog has been refreshed.', 'success');
        fetchMediaHub();
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          clearStoredAdminToken();
          renderAdminSignedOut('Admin session expired. Sign in again to continue.', 'error');
          return;
        }

        setAdminStatus(err.message || 'Unable to submit media item.', 'error');
      })
      .finally(function () {
        setAdminBusy(false);
      });
  }

  function buildAdminPayload(mode) {
    var payload = {
      title: dom.adminTitle ? dom.adminTitle.value.trim() : '',
      type: dom.adminType ? dom.adminType.value : 'image',
      category: dom.adminCategory ? dom.adminCategory.value.trim() : '',
      description: dom.adminDescription ? dom.adminDescription.value.trim() : '',
      thumbnailUrl: dom.adminThumbnailUrl ? dom.adminThumbnailUrl.value.trim() : ''
    };

    if (!payload.title) {
      return Promise.reject(new Error('Title is required.'));
    }

    if (mode === 'url') {
      payload.url = dom.adminUrl ? dom.adminUrl.value.trim() : '';
      if (!payload.url) {
        return Promise.reject(new Error('Media URL is required.'));
      }
      return Promise.resolve(payload);
    }

    if (!dom.adminFile || !dom.adminFile.files || !dom.adminFile.files[0]) {
      return Promise.reject(new Error('Choose a file to upload.'));
    }

    var file = dom.adminFile.files[0];
    if (file.size > uploadLimitBytes) {
      return Promise.reject(new Error('File exceeds the ' + formatFileSize(uploadLimitBytes) + ' upload limit.'));
    }

    return readFileAsUpload(file).then(function (upload) {
      payload.upload = upload;
      return payload;
    });
  }

  function readFileAsUpload(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        var result = typeof reader.result === 'string' ? reader.result : '';
        var parts = result.split(',');
        resolve({
          fileName: file.name,
          mimeType: file.type,
          dataBase64: parts.length > 1 ? parts[1] : parts[0]
        });
      };

      reader.onerror = function () {
        reject(new Error('Unable to read the selected file.'));
      };

      reader.readAsDataURL(file);
    });
  }

  function parseJsonResponse(response) {
    return response.json().catch(function () {
      return {};
    }).then(function (data) {
      if (!response.ok) {
        var err = new Error(data.error || 'Request failed');
        err.status = response.status;
        throw err;
      }
      return data;
    });
  }

  function clearAdminFields() {
    if (dom.adminTitle) dom.adminTitle.value = '';
    if (dom.adminCategory) dom.adminCategory.value = '';
    if (dom.adminUrl) dom.adminUrl.value = '';
    if (dom.adminThumbnailUrl) dom.adminThumbnailUrl.value = '';
    if (dom.adminDescription) dom.adminDescription.value = '';
    if (dom.adminFile) dom.adminFile.value = '';
    if (dom.adminType) dom.adminType.value = 'image';
  }

  function formatAdminExpiry(isoDate) {
    if (!isoDate) return 'later';

    var date = new Date(isoDate);
    if (isNaN(date.getTime())) return 'later';

    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + ' KB';
    }

    return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  }

  function setCount(el, value) {
    if (el) el.textContent = String(value);
  }

  function formatRelativeTime(isoDate) {
    if (!isoDate) return 'recently';

    var diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
    if (diffSec < 60) return 'just now';

    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + (diffMin === 1 ? ' minute ago' : ' minutes ago');

    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + (diffHr === 1 ? ' hour ago' : ' hours ago');

    var diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return diffDay + (diffDay === 1 ? ' day ago' : ' days ago');

    var diffMonth = Math.floor(diffDay / 30);
    return diffMonth + (diffMonth === 1 ? ' month ago' : ' months ago');
  }

  function setupSkipNav() {
    var link = document.getElementById('skip-nav');
    if (!link) return;

    link.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById('main-content');
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
      }
    });
  }

  function setupNavToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('main-nav');
    if (!toggle || !nav) return;

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function openMenu() {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      nav.classList.add('is-open');
      var firstLink = nav.querySelector('a');
      if (firstLink) firstLink.focus();
    }

    function closeMenu() {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      nav.classList.remove('is-open');
      toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) closeMenu();
      else openMenu();
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        closeMenu();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
