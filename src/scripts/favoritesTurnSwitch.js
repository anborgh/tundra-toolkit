/**
 * Переключатель «мой ход / соигрока» на последнем посте избранной темы.
 * Shadow DOM + position:fixed относительно viewport.
 */
(function (global) {
  'use strict';

  const FAVORITES_KEY = 'favoriteTopics';
  const TRUSTED_HOSTS_KEY = 'trustedBoardHosts';
  const HOST_ID = 'tundra-toolkit-turn-switch';
  const GAP = 8;
  const MARGIN = 8;
  const ENDPOST_HEADING = '.post.endpost > h3';

  const storage = global.__TT_SAFE_STORAGE__ || {};
  const safeGet = storage.safeStorageGet;
  const safeSet = storage.safeStorageSet;
  const isChunkedStorageChange = storage.isChunkedStorageChange;

  const isAllowedBoardHost = (host) => {
    if (!host || typeof host !== 'string') return false;

    const raw = host.trim().toLowerCase();
    if (!raw || raw.length > 253) return false;

    let hostname = raw;
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx > -1 && /^\d+$/.test(raw.slice(colonIdx + 1))) {
      const port = Number(raw.slice(colonIdx + 1));
      hostname = raw.slice(0, colonIdx);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    }

    if (!hostname.includes('.')) return false;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname);
  };

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
    return trustedHosts.some((item) => normalizeBoardHost(item) === normalized);
  };

  const isExtensionOnForBoard = async (host) => {
    if (!safeGet) return false;
    try {
      const data = await safeGet([TRUSTED_HOSTS_KEY]);
      const trustedHosts = Array.isArray(data?.[TRUSTED_HOSTS_KEY]) ? data[TRUSTED_HOSTS_KEY] : [];
      return isTrustedBoardHost(host, trustedHosts);
    } catch (e) {
      return false;
    }
  };

  const ICON_FEATHER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.086 18.412A2 2 0 0112.67 19H5v-7.672a2 2 0 01.586-1.414L11.75 3.75a6 6 0 118.49 8.49z"/><path d="M16 8 2 22"/><path d="M17.488 15H9"/></svg>';
  const ICON_HOURGLASS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>';

  const SHADOW_CSS = `
    :host { color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }

    .plaque {
      --tt-h3: 24px;
      --tt-bg: #FFFFFF;
      --tt-fg: #172227;
      --tt-muted: #56646B;
      --tt-subtle: #EDF0EF;
      --tt-border: #DDE2E0;
      --tt-frost: #0E6B62;
      --tt-ember: #B54A12;
      --tt-ember-soft: #FBEDE4;
      --tt-head-bg: #14201F;
      --tt-head-fg: #CFE0DD;
      --tt-ornament: #4F9C91;
      --tt-font-body: "Golos Text", "Golos UI", "Segoe UI", "SF Pro Text", system-ui, -apple-system, sans-serif;

      display: flex;
      flex-direction: column;
      position: relative;
      width: var(--tt-h3);
      height: var(--tt-h3);
      color: var(--tt-fg);
      font-family: var(--tt-font-body);
      font-size: 13px;
      line-height: 1.3;
      letter-spacing: 0;
      text-align: left;
      isolation: isolate;
      color-scheme: light;
      overflow: visible;
    }

    .plaque.is-open {
      overflow: visible;
    }

    @media (prefers-color-scheme: dark) {
      .plaque {
        --tt-bg: #172322;
        --tt-fg: #E4EEEC;
        --tt-muted: #9FB2B0;
        --tt-subtle: #22302F;
        --tt-border: #2A3938;
        --tt-frost: #3BA897;
        --tt-ember: #EE9566;
        --tt-ember-soft: rgba(238, 149, 102, 0.16);
        --tt-head-bg: #0B1413;
        color-scheme: dark;
      }
    }

    .face {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--tt-h3);
      height: var(--tt-h3);
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 25%;
      background: var(--tt-ember-soft);
      color: var(--tt-ember);
      cursor: default;
    }

    .plaque:not(.is-mine) .face {
      background: var(--tt-subtle);
      color: var(--tt-muted);
    }

    .face svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .face .icon-feather,
    .face .icon-wait {
      display: none;
      width: 58%;
      height: 58%;
    }

    .plaque.is-mine .icon-feather,
    .plaque:not(.is-mine) .icon-wait {
      display: block;
    }

    .panel {
      display: none;
      position: absolute;
      left: 0;
      top: 0;
      z-index: 2;
      flex-direction: column;
      min-width: 220px;
      max-width: min(280px, calc(100vw - 16px));
      overflow: hidden;
      background: var(--tt-bg);
      border: 1px solid var(--tt-border);
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(20, 32, 31, 0.22);
    }

    .plaque.is-open .panel {
      display: flex;
    }

    .brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px 15px;
      background: var(--tt-head-bg);
      color: var(--tt-head-fg);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .brand::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 8px;
      background-color: var(--tt-ornament);
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='8'%3E%3Cpath d='M0 7.6 6.5 2.4 13 7.6M4.9.6l3.2 3.2M8.1.6 4.9 3.8' fill='none' stroke='%23000' stroke-width='1.2'/%3E%3C/svg%3E") repeat-x left bottom / 13px 8px;
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='8'%3E%3Cpath d='M0 7.6 6.5 2.4 13 7.6M4.9.6l3.2 3.2M8.1.6 4.9 3.8' fill='none' stroke='%23000' stroke-width='1.2'/%3E%3C/svg%3E") repeat-x left bottom / 13px 8px;
    }

    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
    }

    .side {
      flex: 1 1 0;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--tt-muted);
      font: 500 13px/1.2 var(--tt-font-body);
      cursor: pointer;
      appearance: none;
    }

    .side--mine { text-align: right; }
    .side--theirs { text-align: left; }

    .plaque.is-mine .side--mine {
      color: var(--tt-ember);
      font-weight: 600;
    }

    .plaque:not(.is-mine) .side--theirs {
      color: var(--tt-fg);
      font-weight: 600;
    }

    .switch {
      flex: 0 0 auto;
      position: relative;
      width: 40px;
      height: 24px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 12px;
      background: var(--tt-muted);
      cursor: pointer;
      appearance: none;
      box-shadow: none;
    }

    .plaque.is-mine .switch {
      background: var(--tt-ember);
    }

    .thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #FFFFFF;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      transition: transform 0.15s ease;
    }

    .plaque.is-mine .thumb {
      transform: translateX(0);
    }

    .plaque:not(.is-mine) .thumb {
      transform: translateX(16px);
    }

    .plaque:focus-visible,
    .side:focus-visible,
    .switch:focus-visible {
      outline: 2px solid var(--tt-frost);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .thumb { transition: none; }
    }
  `;

  let boardUrl = '';
  let topicID = '';
  let hostEl = null;
  let shadowRoot = null;
  let plaqueEl = null;
  let faceEl = null;
  let panelEl = null;
  let switchEl = null;
  let mineEl = null;
  let theirsEl = null;
  let currentMyTurn = null;
  let currentItemId = null;
  let persistBusy = false;
  let posRaf = 0;
  let started = false;
  let headingSize = 24;

  const topicIdFromLocation = () => {
    if (!/viewtopic\.php/i.test(location.pathname)) return null;
    return (location.search.match(/[?&]id=(\d+)/) || [])[1] || null;
  };

  const findEndpostHeading = () => document.querySelector(ENDPOST_HEADING);

  const isLastTopicPage = () => {
    if (!findEndpostHeading()) return false;
    if (/[?&]action=last(?:&|$)/i.test(location.search)) return true;

    const pagers = document.querySelectorAll('.paging, .pagelink, .pagelinks');
    if (!pagers.length) return true;

    const currentPage = Number((location.search.match(/[?&]p=(\d+)/) || [])[1] || 1);

    for (const pager of pagers) {
      const current = pager.querySelector('strong');
      if (current) {
        let node = current.nextElementSibling;
        while (node) {
          if (node.tagName === 'A') return false;
          node = node.nextElementSibling;
        }
      }

      const links = pager.querySelectorAll('a[href]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const page = Number((href.match(/[?&]p=(\d+)/) || [])[1] || 0);
        if (page > currentPage) return false;
      }
    }
    return true;
  };

  const setHostBox = (left, top, visible) => {
    if (!hostEl) return;
    const set = (name, value) => hostEl.style.setProperty(name, value, 'important');
    set('all', 'initial');
    set('position', 'fixed');
    set('z-index', '2147483646');
    set('display', 'block');
    set('box-sizing', 'border-box');
    set('margin', '0');
    set('padding', '0');
    set('border', 'none');
    set('background', 'transparent');
    set('overflow', 'visible');
    set('left', `${Math.round(left)}px`);
    set('top', `${Math.round(top)}px`);
    set('width', `${headingSize}px`);
    set('height', `${headingSize}px`);
    set('min-height', `24px`);
    set('max-width', `calc(100vw - ${MARGIN * 2}px)`);
    set('visibility', visible ? 'visible' : 'hidden');
    set('pointer-events', visible ? 'auto' : 'none');
    set('color-scheme', 'light');
  };

  const isOpen = () => !!plaqueEl?.classList.contains('is-open');

  const setOpen = (open) => {
    if (!plaqueEl) return;
    plaqueEl.classList.toggle('is-open', !!open);
    plaqueEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    schedulePosition();
  };

  const positionHost = () => {
    if (!hostEl) return;
    const heading = findEndpostHeading();
    if (!heading) {
      setHostBox(MARGIN, MARGIN, false);
      return;
    }

    const rect = heading.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;

    headingSize = Math.max(16, Math.round(rect.height));
    if (plaqueEl) plaqueEl.style.setProperty('--tt-h3', `${headingSize}px`);

    const width = headingSize;
    const height = headingSize;

    let left = rect.right + GAP;
    let top = rect.top;

    if (left + width + MARGIN > vw) {
      left = rect.left - GAP - width;
    }
    if (left < MARGIN || left + width + MARGIN > vw) {
      left = Math.max(MARGIN, vw - width - MARGIN);
    }

    if (top + height + MARGIN > vh) {
      top = vh - height - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    setHostBox(left, top, visible);

    if (isOpen() && panelEl) {
      panelEl.style.left = '0px';
      panelEl.style.top = '0px';
      const panelW = panelEl.offsetWidth || 220;
      const panelH = panelEl.offsetHeight || 56;
      let panelLeft = 0;
      let panelTop = 0;
      if (left + panelW + MARGIN > vw) {
        panelLeft = Math.min(0, vw - MARGIN - panelW - left);
      }
      if (left + panelLeft < MARGIN) {
        panelLeft = MARGIN - left;
      }
      if (top + panelH + MARGIN > vh) {
        panelTop = Math.min(0, vh - MARGIN - panelH - top);
      }
      if (top + panelTop < MARGIN) {
        panelTop = MARGIN - top;
      }
      panelEl.style.left = `${Math.round(panelLeft)}px`;
      panelEl.style.top = `${Math.round(panelTop)}px`;
    }
  };

  const schedulePosition = () => {
    if (posRaf) return;
    posRaf = requestAnimationFrame(() => {
      posRaf = 0;
      positionHost();
    });
  };

  const applyTurn = (myTurn) => {
    currentMyTurn = !!myTurn;
    if (!plaqueEl || !switchEl) return;
    plaqueEl.classList.toggle('is-mine', currentMyTurn);
    switchEl.setAttribute('aria-checked', currentMyTurn ? 'true' : 'false');
    switchEl.setAttribute(
      'aria-label',
      currentMyTurn
        ? 'Сейчас ваш ход. Нажмите, чтобы отметить: ход соигрока'
        : 'Ход соигрока. Нажмите, чтобы отметить: следующий ход мой',
    );
    if (mineEl) mineEl.setAttribute('aria-pressed', currentMyTurn ? 'true' : 'false');
    if (theirsEl) theirsEl.setAttribute('aria-pressed', currentMyTurn ? 'false' : 'true');
    if (faceEl) {
      faceEl.setAttribute(
        'aria-label',
        currentMyTurn ? 'Tundra Toolkit: сейчас ваш ход' : 'Tundra Toolkit: ход соигрока',
      );
    }
  };

  const persistTurn = async (myTurn) => {
    if (!safeGet || !safeSet || persistBusy) return;
    if (!boardUrl || !topicID) return;
    if (!!myTurn === !!currentMyTurn) return;

    persistBusy = true;
    applyTurn(myTurn);
    try {
      const data = await safeGet([FAVORITES_KEY]);
      const favorites = Array.isArray(data?.[FAVORITES_KEY]) ? data[FAVORITES_KEY] : [];
      let changed = false;
      const updated = favorites.map((item) => {
        if (item.boardUrl !== boardUrl || `${item.topicID}` !== `${topicID}`) return item;
        if (!!item.myTurn === !!myTurn) return item;
        changed = true;
        return { ...item, myTurn: !!myTurn, updatedAt: Date.now() };
      });
      if (changed) {
        await safeSet({
          favoriteTopics: updated.filter((item) => isAllowedBoardHost(item.boardUrl)),
        });
      }
    } catch (e) {
      applyTurn(!myTurn);
    } finally {
      persistBusy = false;
    }
  };

  const teardown = () => {
    currentItemId = null;
    currentMyTurn = null;
    if (hostEl?.isConnected) hostEl.remove();
    hostEl = null;
    shadowRoot = null;
    plaqueEl = null;
    faceEl = null;
    panelEl = null;
    switchEl = null;
    mineEl = null;
    theirsEl = null;
  };

  const ensureHost = () => {
    if (hostEl?.isConnected && shadowRoot) return;

    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();

    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    hostEl.setAttribute('data-tundra-toolkit', 'turn-switch');
    shadowRoot = hostEl.attachShadow({ mode: 'closed' });
    document.documentElement.appendChild(hostEl);

    shadowRoot.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadowRoot.appendChild(style);

    plaqueEl = document.createElement('div');
    plaqueEl.className = 'plaque';
    plaqueEl.setAttribute('tabindex', '0');
    plaqueEl.setAttribute('aria-expanded', 'false');
    plaqueEl.setAttribute('aria-label', 'Tundra Toolkit');
    plaqueEl.title = 'Tundra Toolkit';

    faceEl = document.createElement('div');
    faceEl.className = 'face';
    faceEl.setAttribute('aria-hidden', 'true');
    const feather = document.createElement('span');
    feather.className = 'icon-feather';
    feather.innerHTML = ICON_FEATHER;
    const wait = document.createElement('span');
    wait.className = 'icon-wait';
    wait.innerHTML = ICON_HOURGLASS;
    faceEl.append(feather, wait);

    panelEl = document.createElement('div');
    panelEl.className = 'panel';

    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.textContent = 'Tundra Toolkit';

    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Чей ход в эпизоде');

    mineEl = document.createElement('button');
    mineEl.type = 'button';
    mineEl.className = 'side side--mine';
    mineEl.textContent = 'Мой ход';

    switchEl = document.createElement('button');
    switchEl.type = 'button';
    switchEl.className = 'switch';
    switchEl.setAttribute('role', 'switch');
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.setAttribute('aria-hidden', 'true');
    switchEl.appendChild(thumb);

    theirsEl = document.createElement('button');
    theirsEl.type = 'button';
    theirsEl.className = 'side side--theirs';
    theirsEl.textContent = 'Жду ответа';

    mineEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      persistTurn(true);
    });
    theirsEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      persistTurn(false);
    });
    switchEl.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      persistTurn(!currentMyTurn);
    });

    row.append(mineEl, switchEl, theirsEl);
    panelEl.append(brand, row);
    plaqueEl.append(faceEl, panelEl);
    plaqueEl.addEventListener('click', (event) => event.stopPropagation());
    plaqueEl.addEventListener('mousedown', (event) => event.stopPropagation());
    plaqueEl.addEventListener('mouseenter', () => setOpen(true));
    plaqueEl.addEventListener('mouseleave', () => {
      const active = shadowRoot.activeElement;
      if (active && plaqueEl.contains(active) && active !== plaqueEl) return;
      setOpen(false);
    });
    plaqueEl.addEventListener('focusin', () => setOpen(true));
    plaqueEl.addEventListener('focusout', (event) => {
      const next = event.relatedTarget;
      if (next && plaqueEl.contains(next)) return;
      setOpen(false);
    });
    plaqueEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        plaqueEl.blur();
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target === plaqueEl) {
        event.preventDefault();
        setOpen(!isOpen());
      }
    });
    shadowRoot.appendChild(plaqueEl);
    setHostBox(MARGIN, MARGIN, false);
  };

  const matchFavorite = (favorites) => {
    if (!Array.isArray(favorites) || !boardUrl || !topicID) return null;
    return favorites.find((item) => (
      item
      && item.boardUrl === boardUrl
      && `${item.topicID}` === `${topicID}`
    )) || null;
  };

  const refresh = async () => {
    if (!safeGet) return;
    if (!boardUrl || !topicID || !isAllowedBoardHost(boardUrl) || !isLastTopicPage()) {
      teardown();
      return;
    }
    if (!(await isExtensionOnForBoard(boardUrl))) {
      teardown();
      return;
    }

    let favorite = null;
    try {
      const data = await safeGet([FAVORITES_KEY]);
      favorite = matchFavorite(data?.[FAVORITES_KEY]);
    } catch (e) {
      teardown();
      return;
    }

    if (!favorite) {
      teardown();
      return;
    }

    ensureHost();
    const sameItem = currentItemId === favorite.id && currentMyTurn === !!favorite.myTurn;
    currentItemId = favorite.id;
    if (!sameItem) applyTurn(!!favorite.myTurn);
    schedulePosition();
  };

  const sync = (next = {}) => {
    boardUrl = `${next.boardUrl || location.host}`;
    topicID = `${next.topicID || topicIdFromLocation() || ''}`;
    refresh();
  };

  const onScrollOrResize = () => schedulePosition();

  const start = () => {
    if (started) {
      sync();
      return;
    }
    started = true;

    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', onScrollOrResize);
      global.visualViewport.addEventListener('scroll', onScrollOrResize);
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged && isChunkedStorageChange) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' && area !== 'sync') return;
        const favoritesChanged = isChunkedStorageChange(changes, FAVORITES_KEY);
        const trustChanged = Boolean(changes?.[TRUSTED_HOSTS_KEY]);
        if (!favoritesChanged && !trustChanged) return;
        refresh();
      });
    }

    sync({
      boardUrl: location.host,
      topicID: topicIdFromLocation() || '',
    });
  };

  global.__TT_FAVORITES_TURN_SWITCH__ = { start, sync, teardown };
  start();
})(typeof globalThis !== 'undefined' ? globalThis : window);
