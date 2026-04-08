/**
 * Hidden admin shortcut handler.
 * Grants temporary access to the standalone admin page without exposing a public link.
 */

(function () {
  'use strict';

  var ADMIN_PAGE_URL = 'admin.html';
  var SHORTCUT_GRANT_KEY = 'artemisTracker.adminShortcutGrant';
  var SHORTCUT_GRANT_TTL_MS = 2 * 60 * 1000;
  var SECRET_SEQUENCE = 'artemisadmin';
  var inputBuffer = '';
  var lastKeyAt = 0;

  function init() {
    document.addEventListener('keydown', handleKeydown);
  }

  function handleKeydown(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.ctrlKey && event.altKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      grantAndRedirect();
      return;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    var now = Date.now();
    if (now - lastKeyAt > 1500) {
      inputBuffer = '';
    }
    lastKeyAt = now;

    inputBuffer = (inputBuffer + event.key.toLowerCase()).slice(-SECRET_SEQUENCE.length);

    if (inputBuffer === SECRET_SEQUENCE) {
      grantAndRedirect();
    }
  }

  function grantAndRedirect() {
    try {
      window.sessionStorage.setItem(SHORTCUT_GRANT_KEY, JSON.stringify({
        exp: Date.now() + SHORTCUT_GRANT_TTL_MS
      }));
    } catch (err) {
      // Ignore storage failures and still navigate.
    }

    window.location.href = ADMIN_PAGE_URL;
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;

    var tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
