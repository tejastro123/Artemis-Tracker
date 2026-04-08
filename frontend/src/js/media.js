/**
 * Artemis II Media Center
 * Images, videos, latest news, and important mission links.
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

  var dom = {};

  function cacheDom() {
    dom = {
      dataStatus: document.getElementById('data-status'),
      mediaFeedStatus: document.getElementById('media-feed-status'),
      mediaGeneratedAt: document.getElementById('media-generated-at'),
      images: document.getElementById('media-images'),
      videos: document.getElementById('media-videos'),
      news: document.getElementById('media-news-list'),
      links: document.getElementById('important-links'),
      countImages: document.getElementById('media-count-images'),
      countVideos: document.getElementById('media-count-videos'),
      countNews: document.getElementById('media-count-news'),
      countLinks: document.getElementById('media-count-links')
    };
  }

  function init() {
    cacheDom();
    setupSkipNav();
    setupNavToggle();
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
    var images = Array.isArray(payload.images) ? payload.images : items.filter(function (item) { return item.type === 'image'; });
    var videos = Array.isArray(payload.videos) ? payload.videos : items.filter(function (item) { return item.type === 'video'; });
    var links = Array.isArray(payload.importantLinks) ? payload.importantLinks : [];

    renderMediaCards(dom.images, images, 'image');
    renderMediaCards(dom.videos, videos, 'video');
    renderImportantLinks(links);

    setCount(dom.countImages, images.length);
    setCount(dom.countVideos, videos.length);
    setCount(dom.countLinks, links.length);

    if (dom.mediaFeedStatus) {
      dom.mediaFeedStatus.textContent = payload.usingFallbackMedia
        ? 'Using bundled fallback media while the database is empty or temporarily unavailable.'
        : 'Connected to the live mission media catalog.';
      dom.mediaFeedStatus.className = payload.usingFallbackMedia
        ? 'media-status media-status--warning'
        : 'media-status media-status--live';
    }

    if (dom.mediaGeneratedAt && payload.generatedAt) {
      dom.mediaGeneratedAt.textContent = 'Updated ' + formatRelativeTime(payload.generatedAt);
    }
  }

  function renderMediaError() {
    var errorText = '<p class="media-empty">Unable to load this section right now.</p>';
    if (dom.images) dom.images.innerHTML = errorText;
    if (dom.videos) dom.videos.innerHTML = errorText;
    if (dom.links) dom.links.innerHTML = errorText;
    if (dom.mediaFeedStatus) {
      dom.mediaFeedStatus.textContent = 'Media hub unavailable right now.';
      dom.mediaFeedStatus.className = 'media-status media-status--warning';
    }
  }

  function renderMediaCards(container, items, type) {
    if (!container) return;

    if (!items || !items.length) {
      container.innerHTML = '<p class="media-empty">No ' + (type === 'image' ? 'images' : 'videos') + ' available yet.</p>';
      return;
    }

    container.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      container.appendChild(createMediaCard(items[i], type));
    }
  }

  function createMediaCard(item, type) {
    var card = document.createElement('article');
    card.className = 'media-card';

    var badge = document.createElement('span');
    badge.className = 'media-card__badge';
    badge.textContent = type === 'image' ? 'Image' : 'Video';
    card.appendChild(badge);

    var mediaFrame = document.createElement('div');
    mediaFrame.className = 'media-card__media';
    mediaFrame.appendChild(type === 'image' ? createImageElement(item) : createVideoElement(item));
    card.appendChild(mediaFrame);

    var body = document.createElement('div');
    body.className = 'media-card__body';

    var category = document.createElement('p');
    category.className = 'media-card__category';
    category.textContent = item.category || 'Mission';
    body.appendChild(category);

    var title = document.createElement('h3');
    title.className = 'media-card__title';
    title.textContent = item.title || (type === 'image' ? 'Mission image' : 'Mission video');
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
    action.textContent = type === 'image' ? 'Open image' : 'Watch video';
    footer.appendChild(action);

    body.appendChild(footer);
    card.appendChild(body);

    return card;
  }

  function createImageElement(item) {
    var img = document.createElement('img');
    img.className = 'media-card__image';
    img.loading = 'lazy';
    img.alt = item.title || 'Artemis II mission image';
    img.src = resolvePreviewImage(item);
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
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(href)) {
      var video = document.createElement('video');
      video.controls = true;
      video.preload = 'metadata';
      video.poster = resolvePreviewImage(item) || 'img/artemis-ii-launch.jpg';
      video.src = href;
      return video;
    }

    var fallbackImg = document.createElement('img');
    fallbackImg.className = 'media-card__image';
    fallbackImg.loading = 'lazy';
    fallbackImg.alt = item.title || 'Video preview';
    fallbackImg.src = resolvePreviewImage(item);
    return fallbackImg;
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

    return resolveAssetPath(item.url);
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
      meta.appendChild(document.createTextNode(' · '));
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
