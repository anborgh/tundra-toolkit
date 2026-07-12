/**
 * Shared host/trust/controls helpers for ISOLATED content script.
 * Loaded before isolated.js; bindings taken off globalThis immediately.
 */
(function (global) {
  'use strict';

  const TRUSTED_HOSTS_KEY = 'trustedBoardHosts';
  const CONTROLS_VISIBILITY_OPT_IN_KEY = 'controlsVisibilityOptIn';

  const normalizeBoardHost = (host) => {
    if (!host || typeof host !== 'string') return null;

    const raw = host.trim().toLowerCase();
    if (!raw) return null;

    let hostname = raw;
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx > -1 && /^\d+$/.test(raw.slice(colonIdx + 1))) {
      hostname = raw.slice(0, colonIdx);
    }

    return hostname || null;
  };

  const isTrustedBoardHost = (host, trustedHosts = []) => {
    const normalized = normalizeBoardHost(host);
    if (!normalized) return false;
    return trustedHosts.some(item => normalizeBoardHost(item) === normalized);
  };

  const isControlsVisibleForBoard = (map, boardID, optIn) => {
    if (!boardID) return false;
    const value = map?.[boardID];
    return optIn ? value === true : value !== false;
  };

  global.__TT_BOARD_UTILS__ = {
    TRUSTED_HOSTS_KEY,
    CONTROLS_VISIBILITY_OPT_IN_KEY,
    normalizeBoardHost,
    isTrustedBoardHost,
    isControlsVisibleForBoard,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
