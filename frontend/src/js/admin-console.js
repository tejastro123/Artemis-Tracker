/**
 * Hidden Artemis II admin console.
 * Access is unlocked by a private shortcut, then authenticated with an admin session.
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
  var ADMIN_LOGIN_URL = MEDIA_API_URL + '/admin/login';
  var ADMIN_SESSION_URL = MEDIA_API_URL + '/admin/session';
  var ADMIN_SESSION_TOKEN_STORAGE_KEY = 'artemisTracker.adminSessionToken';
  var ADMIN_SHORTCUT_GRANT_KEY = 'artemisTracker.adminShortcutGrant';
  var uploadLimitBytes = 25 * 1024 * 1024;

  var dom = {};

  function cacheDom() {
    dom = {
      lockedPanel: document.getElementById('admin-locked-panel'),
      lockedStatus: document.getElementById('admin-locked-status'),
      loginPanel: document.getElementById('admin-login-panel'),
      loginForm: document.getElementById('admin-login-form'),
      loginPassword: document.getElementById('admin-password'),
      loginSubmit: document.getElementById('admin-login-submit'),
      loginStatus: document.getElementById('admin-login-status'),
      consolePanel: document.getElementById('admin-console-panel'),
      sessionStatus: document.getElementById('admin-session-status'),
      logout: document.getElementById('admin-logout'),
      form: document.getElementById('admin-media-form'),
      submit: document.getElementById('admin-submit'),
      submitStatus: document.getElementById('admin-submit-status'),
      type: document.getElementById('admin-type'),
      title: document.getElementById('admin-title'),
      category: document.getElementById('admin-category'),
      url: document.getElementById('admin-url'),
      file: document.getElementById('admin-file'),
      thumbnailUrl: document.getElementById('admin-thumbnail-url'),
      description: document.getElementById('admin-description'),
      modeUrl: document.getElementById('admin-mode-url'),
      modeUpload: document.getElementById('admin-mode-upload'),
      urlRow: document.getElementById('admin-url-row'),
      fileRow: document.getElementById('admin-file-row'),
      summaryImages: document.getElementById('summary-images'),
      summaryVideos: document.getElementById('summary-videos'),
      summaryDocuments: document.getElementById('summary-documents'),
      summaryOther: document.getElementById('summary-other'),
      recentList: document.getElementById('recent-media-list')
    };
  }

  function init() {
    cacheDom();
    bindEvents();
    restoreAccess();
  }

  function bindEvents() {
    if (dom.loginForm) {
      dom.loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        submitLogin();
      });
    }

    if (dom.logout) {
      dom.logout.addEventListener('click', function () {
        clearAdminToken();
        clearShortcutGrant();
        renderLocked('Signed out. Use the private shortcut again to unlock this page.');
      });
    }

    if (dom.modeUrl) {
      dom.modeUrl.addEventListener('change', toggleMode);
    }

    if (dom.modeUpload) {
      dom.modeUpload.addEventListener('change', toggleMode);
    }

    if (dom.file) {
      dom.file.addEventListener('change', handleFileSelection);
    }

    if (dom.form) {
      dom.form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitMedia();
      });
    }

    toggleMode();
  }

  function restoreAccess() {
    var token = getAdminToken();

    if (token) {
      validateSession(token, true);
      return;
    }

    if (hasValidShortcutGrant()) {
      renderLogin('Shortcut verified. Sign in to continue.');
      return;
    }

    renderLocked('Awaiting shortcut unlock.');
  }

  function validateSession(token, silent) {
    if (!silent) {
      setLoginBusy(true);
      setLoginStatus('Validating admin session...', 'info');
    }

    fetch(ADMIN_SESSION_URL, {
      method: 'GET',
      headers: {
        'x-admin-token': token
      }
    })
      .then(parseJsonResponse)
      .then(function (data) {
        renderConsole(data.expiresAt);
      })
      .catch(function () {
        clearAdminToken();
        if (hasValidShortcutGrant()) {
          renderLogin('Admin session expired. Sign in again.');
        } else {
          renderLocked('Session unavailable. Use the private shortcut to unlock sign-in.');
        }
      })
      .finally(function () {
        if (!silent) {
          setLoginBusy(false);
        }
      });
  }

  function submitLogin() {
    var password = dom.loginPassword ? dom.loginPassword.value.trim() : '';
    if (!password) {
      setLoginStatus('Enter the admin password.', 'error');
      return;
    }

    setLoginBusy(true);
    setLoginStatus('Signing in...', 'info');

    fetch(ADMIN_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: password })
    })
      .then(parseJsonResponse)
      .then(function (data) {
        storeAdminToken(data.token);
        clearShortcutGrant();
        if (dom.loginPassword) {
          dom.loginPassword.value = '';
        }
        renderConsole(data.expiresAt);
      })
      .catch(function (err) {
        renderLogin(err.message || 'Unable to sign in.', 'error');
      })
      .finally(function () {
        setLoginBusy(false);
      });
  }

  function renderLocked(message) {
    if (dom.lockedPanel) dom.lockedPanel.hidden = false;
    if (dom.loginPanel) dom.loginPanel.hidden = true;
    if (dom.consolePanel) dom.consolePanel.hidden = true;
    if (dom.lockedStatus) dom.lockedStatus.textContent = message || 'Awaiting shortcut unlock.';
  }

  function renderLogin(message, tone) {
    if (dom.lockedPanel) dom.lockedPanel.hidden = true;
    if (dom.loginPanel) dom.loginPanel.hidden = false;
    if (dom.consolePanel) dom.consolePanel.hidden = true;
    setLoginStatus(message || 'Shortcut verified. Sign in to continue.', tone || 'info');
  }

  function renderConsole(expiresAt) {
    if (dom.lockedPanel) dom.lockedPanel.hidden = true;
    if (dom.loginPanel) dom.loginPanel.hidden = true;
    if (dom.consolePanel) dom.consolePanel.hidden = false;

    setSubmitStatus('Ready to post.', 'info');

    if (dom.sessionStatus) {
      dom.sessionStatus.textContent = 'Admin session active until ' + formatAdminExpiry(expiresAt) + '.';
      dom.sessionStatus.className = 'admin-status admin-status--success';
    }

    fetchCatalogSnapshot();
  }

  function setLoginStatus(message, tone) {
    if (!dom.loginStatus) return;
    dom.loginStatus.textContent = message;
    dom.loginStatus.className = 'admin-status' + (tone ? ' admin-status--' + tone : '');
  }

  function setLoginBusy(isBusy) {
    if (dom.loginSubmit) dom.loginSubmit.disabled = isBusy;
    if (dom.loginPassword) dom.loginPassword.disabled = isBusy;
    if (dom.loginSubmit) dom.loginSubmit.textContent = isBusy ? 'Signing In...' : 'Sign In';
  }

  function getMode() {
    return dom.modeUpload && dom.modeUpload.checked ? 'upload' : 'url';
  }

  function toggleMode() {
    var mode = getMode();

    if (dom.urlRow) dom.urlRow.hidden = mode !== 'url';
    if (dom.fileRow) dom.fileRow.hidden = mode !== 'upload';
    if (dom.url) dom.url.required = mode === 'url';
    if (dom.file) dom.file.required = mode === 'upload';
    if (dom.submit) dom.submit.textContent = mode === 'upload' ? 'Upload Asset' : 'Post Asset';
  }

  function handleFileSelection() {
    if (!dom.file || !dom.file.files || !dom.file.files[0]) return;

    var file = dom.file.files[0];
    if (dom.title && !dom.title.value.trim()) {
      dom.title.value = stripExtension(file.name);
    }

    if (dom.type) {
      dom.type.value = inferTypeFromFile(file);
    }
  }

  function submitMedia() {
    var token = getAdminToken();
    if (!token) {
      renderLocked('Admin session missing. Use the private shortcut again.');
      return;
    }

    setSubmitBusy(true);
    setSubmitStatus(getMode() === 'upload' ? 'Encoding file and sending upload...' : 'Posting new media item...', 'info');

    buildPayload()
      .then(function (payload) {
        return fetch(MEDIA_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token
          },
          body: JSON.stringify(payload)
        });
      })
      .then(parseJsonResponse)
      .then(function () {
        clearForm();
        setSubmitStatus('Media item saved. Catalog updated.', 'success');
        fetchCatalogSnapshot();
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          clearAdminToken();
          renderLogin('Admin session expired. Sign in again.', 'error');
          return;
        }

        setSubmitStatus(err.message || 'Unable to submit media item.', 'error');
      })
      .finally(function () {
        setSubmitBusy(false);
      });
  }

  function buildPayload() {
    var payload = {
      title: dom.title ? dom.title.value.trim() : '',
      type: dom.type ? dom.type.value : 'image',
      category: dom.category ? dom.category.value.trim() : '',
      description: dom.description ? dom.description.value.trim() : '',
      thumbnailUrl: dom.thumbnailUrl ? dom.thumbnailUrl.value.trim() : ''
    };

    if (!payload.title) {
      return Promise.reject(new Error('Title is required.'));
    }

    if (getMode() === 'url') {
      payload.url = dom.url ? dom.url.value.trim() : '';
      if (!payload.url) {
        return Promise.reject(new Error('Media URL is required.'));
      }
      return Promise.resolve(payload);
    }

    if (!dom.file || !dom.file.files || !dom.file.files[0]) {
      return Promise.reject(new Error('Choose a file to upload.'));
    }

    var file = dom.file.files[0];
    if (file.size > uploadLimitBytes) {
      return Promise.reject(new Error('File exceeds the ' + formatFileSize(uploadLimitBytes) + ' upload limit.'));
    }

    return readFileAsUpload(file).then(function (upload) {
      payload.upload = upload;
      return payload;
    });
  }

  function fetchCatalogSnapshot() {
    fetch(MEDIA_API_URL)
      .then(parseJsonResponse)
      .then(function (data) {
        var items = Array.isArray(data.items) ? data.items : [];
        setText(dom.summaryImages, String((data.images || []).length));
        setText(dom.summaryVideos, String((data.videos || []).length));
        setText(dom.summaryDocuments, String((data.documents || []).length));
        setText(dom.summaryOther, String((data.others || []).length));
        renderRecentItems(items.slice(0, 8));
      })
      .catch(function () {
        renderRecentItems([]);
      });
  }

  function renderRecentItems(items) {
    if (!dom.recentList) return;

    if (!items.length) {
      dom.recentList.innerHTML = '<p class="admin-note">No recent media items available.</p>';
      return;
    }

    dom.recentList.innerHTML = '';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var card = document.createElement('article');
      card.className = 'admin-list__item';

      var meta = document.createElement('p');
      meta.className = 'admin-list__meta';
      meta.textContent = (item.type || 'media') + ' - ' + formatRelativeTime(item.createdAt);
      card.appendChild(meta);

      var title = document.createElement('p');
      title.className = 'admin-list__title';
      title.textContent = item.title || 'Untitled asset';
      card.appendChild(title);

      var desc = document.createElement('p');
      desc.className = 'admin-list__desc';
      desc.textContent = item.description || item.url || 'Manual media asset';
      card.appendChild(desc);

      dom.recentList.appendChild(card);
    }
  }

  function setSubmitStatus(message, tone) {
    if (!dom.submitStatus) return;
    dom.submitStatus.textContent = message;
    dom.submitStatus.className = 'admin-status' + (tone ? ' admin-status--' + tone : '');
  }

  function setSubmitBusy(isBusy) {
    if (dom.submit) dom.submit.disabled = isBusy;
    if (dom.submit) dom.submit.textContent = isBusy
      ? (getMode() === 'upload' ? 'Uploading...' : 'Posting...')
      : (getMode() === 'upload' ? 'Upload Asset' : 'Post Asset');
  }

  function clearForm() {
    if (dom.title) dom.title.value = '';
    if (dom.category) dom.category.value = '';
    if (dom.url) dom.url.value = '';
    if (dom.file) dom.file.value = '';
    if (dom.thumbnailUrl) dom.thumbnailUrl.value = '';
    if (dom.description) dom.description.value = '';
    if (dom.type) dom.type.value = 'image';
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

  function getAdminToken() {
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
      // Ignore storage failures and keep current UI state.
    }
  }

  function clearAdminToken() {
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_TOKEN_STORAGE_KEY);
    } catch (err) {
      // Ignore storage failures.
    }
  }

  function hasValidShortcutGrant() {
    try {
      var raw = window.sessionStorage.getItem(ADMIN_SHORTCUT_GRANT_KEY);
      if (!raw) return false;

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.exp !== 'number') return false;
      if (parsed.exp <= Date.now()) {
        clearShortcutGrant();
        return false;
      }

      return true;
    } catch (err) {
      clearShortcutGrant();
      return false;
    }
  }

  function clearShortcutGrant() {
    try {
      window.sessionStorage.removeItem(ADMIN_SHORTCUT_GRANT_KEY);
    } catch (err) {
      // Ignore storage failures.
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

  function formatRelativeTime(isoDate) {
    if (!isoDate) return 'recently';

    var diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
    if (diffSec < 60) return 'just now';

    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + (diffMin === 1 ? ' minute ago' : ' minutes ago');

    var diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + (diffHr === 1 ? ' hour ago' : ' hours ago');

    var diffDay = Math.floor(diffHr / 24);
    return diffDay + (diffDay === 1 ? ' day ago' : ' days ago');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + ' KB';
    }

    return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
