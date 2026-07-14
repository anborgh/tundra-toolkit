/**
 * Подмена основного CSS форума на Cornflower
 */
(function (global) {
  'use strict';

  const STYLE_OVERRIDE_KEY = 'styleOverrideByHost';
  const TRUSTED_HOSTS_KEY = 'trustedBoardHosts';
  const CORNFLOWER_PATH = '/style/Cornflower/Cornflower.css';
  const MAIN_STYLE_HOST = 'forumstatic.ru';
  const OVERRIDE_CLASS = 'tundra-style-override';

  const DECORATIVE_CONTAINER_SELECTORS = [ '#html-header', '#html-footer', '#pun-announcement' ];
  const DISABLED_MARK = 'ttStyleOverrideDisabled';

  const EXTRA_CSS_PATH = '/style/extra.css';

  const normalizeHost = (host) => {
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

  /**
   * @param {string | null} host
   * @param {string[]} trustedHosts
   */
  const isTrustedBoardHost = (host, trustedHosts) => {
    const normalized = normalizeHost(host);
    if (!normalized) return false;
    return (trustedHosts || []).some((item) => normalizeHost(item) === normalized);
  };

  const currentHost = normalizeHost(window.location.host);

  let enabled = false;
  let styleEl = null;
  let linkEl = null;
  let structObserver = null;

  const ensureStyleTag = () => {
    if (!document.head) return;
    if (styleEl && styleEl.isConnected) return;

    styleEl = document.head.querySelector('style[data-tundra-style-override]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-tundra-style-override', 'true');
      styleEl.textContent =
        `html.${OVERRIDE_CLASS} #html-header, html.${OVERRIDE_CLASS} #html-footer, html.${OVERRIDE_CLASS} #pun-announcement { display: none !important; }\n` +
        `html.${OVERRIDE_CLASS} .pa-avatar img { max-width: 120px !important; }\n` +
        `html.${OVERRIDE_CLASS} .post-sig { display: none !important; }\n` +
        `html.${OVERRIDE_CLASS} .post-author [class*="pa-fld"] { display: none !important; }\n` +
        `html.${OVERRIDE_CLASS} .category .tcl img { display: none !important; }\n` +
        `html.${OVERRIDE_CLASS} #pun-navlinks #form-login { display: none !important; }\n` +
        `html.${OVERRIDE_CLASS} #pun-title { background: transparent !important; background-image: none !important; height: auto !important; width: auto !important; }`;
      document.head.appendChild(styleEl);
    }
  };

  const applyClass = () => {
    if (!document.documentElement) return;
    document.documentElement.classList.toggle(OVERRIDE_CLASS, enabled);
  };

  /** @param {Element} link */
  const isMainStyleLink = (link) => {
    if (!(link instanceof HTMLLinkElement)) return false;
    const rel = (link.getAttribute('rel') || '').toLowerCase();
    if (!rel.split(/\s+/).includes('stylesheet')) return false;

    const href = link.getAttribute('href');
    if (!href) return false;

    try {
      const url = new URL(href, window.location.href);
      return url.hostname === MAIN_STYLE_HOST && /\/styles\//.test(url.pathname);
    } catch (e) {
      return false;
    }
  };

  const scanForLink = () => {
    const links = document.querySelectorAll('link[href]');
    for (let i = 0; i < links.length; i++) {
      if (isMainStyleLink(links[i])) return /** @type {HTMLLinkElement} */ (links[i]);
    }
    return null;
  };

  const captureLink = () => {
    if (linkEl) return true;
    const found = scanForLink();
    if (!found) return false;
    linkEl = found;
    return true;
  };

  const applyLinkState = () => {
    if (!linkEl) return;
    if (enabled) {
      if (!linkEl.dataset.ttOriginalHref) {
        linkEl.dataset.ttOriginalHref = linkEl.getAttribute('href') || '';
      }
      linkEl.setAttribute('href', `${window.location.origin}${CORNFLOWER_PATH}`);
    } else if (linkEl.dataset.ttOriginalHref) {
      linkEl.setAttribute('href', linkEl.dataset.ttOriginalHref);
    }
  };

  const stopStructObserver = () => {
    if (!structObserver) return;
    structObserver.disconnect();
    structObserver = null;
  };

  let extraLinkEl = null;

  const ensureExtraStylesheet = () => {
    if (!document.head) return;
    if (extraLinkEl && extraLinkEl.isConnected) return;

    extraLinkEl = document.head.querySelector('link[data-tundra-style-override-extra]');
    if (!extraLinkEl) {
      const alreadyLinked = Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]')).some((link) => {
        try {
          const href = /** @type {HTMLLinkElement} */ (link).href;
          return new URL(href, window.location.href).pathname === EXTRA_CSS_PATH;
        } catch (e) {
          return false;
        }
      });
      if (alreadyLinked) return;

      extraLinkEl = document.createElement('link');
      extraLinkEl.setAttribute('rel', 'stylesheet');
      extraLinkEl.setAttribute('data-tundra-style-override-extra', 'true');
      extraLinkEl.setAttribute('href', `${window.location.origin}${EXTRA_CSS_PATH}`);
      document.head.appendChild(extraLinkEl);
    }
  };

  const removeExtraStylesheet = () => {
    if (extraLinkEl) {
      extraLinkEl.remove();
      extraLinkEl = null;
    }
  };

  const disableEmbeddedStylesIn = (root) => {
    const nodes = root.querySelectorAll('style:not([data-tundra-style-override]), link[rel~="stylesheet"]');
    nodes.forEach((el) => {
      const node = /** @type {HTMLStyleElement} */ (el);
      if (node.dataset[DISABLED_MARK] === 'true') return;
      try {
        if (node.sheet) node.sheet.disabled = true;
        node.disabled = true;
      } catch (e) {
        // ignore
      }
      node.dataset[DISABLED_MARK] = 'true';
    });
  };

  const disableEmbeddedStyles = () => {
    DECORATIVE_CONTAINER_SELECTORS.forEach((sel) => {
      const container = document.querySelector(sel);
      if (container) disableEmbeddedStylesIn(container);
    });
  };

  const restoreEmbeddedStyles = () => {
    const nodes = document.querySelectorAll(`[data-tt-style-override-disabled="true"]`);
    nodes.forEach((el) => {
      const node = /** @type {HTMLStyleElement} */ (el);
      try {
        if (node.sheet) node.sheet.disabled = false;
        node.disabled = false;
      } catch (e) {
        // ignore
      }
      delete node.dataset[DISABLED_MARK];
    });
  };

  let decorativeObserver = null;

  const stopDecorativeObserver = () => {
    if (!decorativeObserver) return;
    decorativeObserver.disconnect();
    decorativeObserver = null;
  };

  const startDecorativeObserver = () => {
    if (decorativeObserver) return;
    decorativeObserver = new MutationObserver(() => disableEmbeddedStyles());
    decorativeObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  };

  const startStructObserver = () => {
    if (structObserver || linkEl) return;
    structObserver = new MutationObserver(() => {
      applyClass();
      ensureStyleTag();
      if (enabled) ensureExtraStylesheet();
      if (captureLink()) {
        applyLinkState();
        stopStructObserver();
      }
    });
    structObserver.observe(document, { childList: true, subtree: true });
  };

  /** @param {any} value */
  const setEnabled = (value) => {
    enabled = value === true;
    applyClass();
    ensureStyleTag();
    if (captureLink()) {
      applyLinkState();
      stopStructObserver();
    }
    if (enabled) {
      disableEmbeddedStyles();
      ensureExtraStylesheet();
      startDecorativeObserver();
    } else {
      stopDecorativeObserver();
      restoreEmbeddedStyles();
      removeExtraStylesheet();
    }
  };

  startStructObserver();
  applyClass();
  ensureStyleTag();

  if (currentHost) {
    try {
      chrome.storage.local.get([ STYLE_OVERRIDE_KEY, TRUSTED_HOSTS_KEY ], (stored) => {
        if (chrome.runtime.lastError) return;
        const map = stored?.[STYLE_OVERRIDE_KEY] || {};
        const trustedHosts = stored?.[TRUSTED_HOSTS_KEY] || [];
        const wantsOverride = map[currentHost] === true;
        setEnabled(wantsOverride && isTrustedBoardHost(currentHost, trustedHosts));
      });
    } catch (e) {
      // ignore
    }
  }

  global.__TT_STYLE_OVERRIDE__ = {
    setEnabled,
    isEnabled: () => enabled,
    getHost: () => currentHost,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
