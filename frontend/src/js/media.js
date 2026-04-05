/**
 * Artemis II Media Gallery — Frontend Logic
 * Data fetching and dynamic rendering of images and videos.
 */

(function () {
  'use strict';

  // ── Unified Backend Configuration ─────────────────────────────────────
  // Detect if running locally or in production
  var BACKEND_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('192.168.'))
    ? 'http://localhost:3001'
    : 'https://artemis-tracker-yexp.onrender.com'; // Actual Render backend URL
  
  var API_BASE = BACKEND_BASE + '/api/v1';
  var MEDIA_API_URL = API_BASE + '/media';

  var galleryContainer = document.getElementById('media-gallery');
  var filterButtons = document.querySelectorAll('.filter-btn');
  var allMedia = [];

  function init() {
    fetchMedia();
    setupFilters();
  }

  function fetchMedia() {
    fetch(MEDIA_API_URL)
      .then(function (resp) {
        if (!resp.ok) throw new Error('media fetch ' + resp.status);
        return resp.json();
      })
      .then(function (data) {
        allMedia = data;
        renderGallery(allMedia);
      })
      .catch(function (err) {
        console.error('Failed to fetch media:', err);
        if (galleryContainer) {
          galleryContainer.innerHTML = '<div class="error">Unable to load mission media. Using backup data sources...</div>';
        }
      });
  }

  function renderGallery(items) {
    if (!galleryContainer) return;
    
    if (items.length === 0) {
      galleryContainer.innerHTML = '<div class="no-results">No media found for this selection.</div>';
      return;
    }

    galleryContainer.innerHTML = '';
    
    items.forEach(function(item) {
      var card = createMediaCard(item);
      galleryContainer.appendChild(card);
    });
  }

  function createMediaCard(item) {
    var card = document.createElement('div');
    card.className = 'media-card';
    card.setAttribute('data-type', item.type);

    var typeBadge = '<span class="type-badge">' + item.type + '</span>';
    var previewHtml = '';
    var fullUrl = item.url;
    
    // Resolve full URL correctly for local files
    if (!item.url.startsWith('http')) {
      fullUrl = BACKEND_BASE + (item.url.startsWith('/') ? '' : '/') + item.url;
    }

    // Google Drive URL Detection & Transformation
    if (item.url.includes('drive.google.com')) {
      var driveId = '';
      var match = item.url.match(/d\/([^\/?]+)/) || item.url.match(/id=([^&]+)/);
      if (match) driveId = match[1];

      if (item.type === 'video') {
        // Embedded Drive Player for videos is the most reliable way 
        previewHtml = '<div class="video-container"><iframe src="https://drive.google.com/file/d/' + driveId + '/preview" frameborder="0" allow="autoplay" style="width:100%; height:100%;"></iframe></div>';
      } else {
        // Direct image access for Google Drive
        var driveImgUrl = 'https://drive.google.com/uc?export=view&id=' + driveId;
        previewHtml = '<img src="' + driveImgUrl + '" alt="' + item.title + '" class="media-preview" loading="lazy">';
        fullUrl = driveImgUrl;
      }
    } else if (item.type === 'video') {
      if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
        previewHtml = '<div class="video-container"><iframe src="' + item.url + '" frameborder="0" allowfullscreen></iframe></div>';
      } else {
        // Local MP4 video
        previewHtml = '<div class="video-container"><video src="' + fullUrl + '" controls poster="img/artemis-ii-launch.jpg" style="width:100%; height:100%; object-fit:cover;"></video></div>';
      }
    } else {
      previewHtml = '<img src="' + fullUrl + '" alt="' + item.title + '" class="media-preview" loading="lazy">';
    }

    var content = 
      typeBadge +
      previewHtml +
      '<div class="media-info">' +
        '<div class="media-category">' + (item.category || 'Mission') + '</div>' +
        '<h3 class="media-title">' + item.title + '</h3>' +
        '<p class="media-desc">' + (item.description || '') + '</p>' +
        '<div class="media-actions">' +
          '<a href="' + fullUrl + '" download="' + item.title + '" target="_blank" class="download-btn">Download</a>' +
        '</div>' +
      '</div>';

    card.innerHTML = content;
    return card;
  }

  function setupFilters() {
    filterButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var filter = btn.getAttribute('data-filter');
        
        // Update active button state
        filterButtons.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');

        // Apply filter
        if (filter === 'all') {
          renderGallery(allMedia);
        } else {
          var filtered = allMedia.filter(function(item) {
            return item.type === filter;
          });
          renderGallery(filtered);
        }
      });
    });
  }

  // Kick-off
  init();
})();
