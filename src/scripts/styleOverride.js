/**
 * Подмена основного CSS форума на Cornflower — максимально быстрый путь.
 *
 * Живёт отдельным content_script с run_at "document_start" в ISOLATED world:
 * DOM общий со страницей (в отличие от JS-переменных страницы), поэтому мы
 * можем перехватить/подменить <link rel="stylesheet"> ещё до того, как
 * браузер успеет загрузить и применить оригинальную тему — без ожидания
 * моста MAIN↔ISOLATED и без ожидания ForumAPITicket/boardID (нужен только
 * host, известный синхронно).
 *
 * Все content_scripts этого расширения в ISOLATED world одного фрейма
 * выполняются в общем JS-контексте (общий globalThis), поэтому API
 * публикуется через globalThis.__TT_STYLE_OVERRIDE__ и переиспользуется
 * isolated.js для мгновенного live-переключения из попапа без повторного
 * чтения storage.
 */
(function (global) {
  'use strict';

  const STYLE_OVERRIDE_KEY = 'styleOverrideByHost';
  const CORNFLOWER_PATH = '/style/Cornflower/Cornflower.css';
  const MAIN_STYLE_HOST = 'forumstatic.ru';
  const OVERRIDE_CLASS = 'tundra-style-override';

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
        `html.${OVERRIDE_CLASS} .post-author [class*="pa-fld"] { display: none !important; }`;
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

  const startStructObserver = () => {
    if (structObserver || linkEl) return;
    structObserver = new MutationObserver(() => {
      applyClass();
      ensureStyleTag();
      if (captureLink()) {
        applyLinkState();
        stopStructObserver();
      }
    });
    // На document_start <html>/<head>/<link> ещё не распарсены — ловим их появление.
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
  };

  // Наблюдение стартует немедленно и независимо от ответа storage —
  // чтобы не упустить момент появления <link>, даже если storage ответит
  // на пару миллисекунд позже парсера.
  startStructObserver();
  applyClass();
  ensureStyleTag();

  if (currentHost) {
    try {
      chrome.storage.local.get([ STYLE_OVERRIDE_KEY ], (stored) => {
        if (chrome.runtime.lastError) return;
        const map = stored?.[STYLE_OVERRIDE_KEY] || {};
        setEnabled(map[currentHost] === true);
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
