const __ttFactory = globalThis.__TT_BRIDGE_FACTORY__;
delete globalThis.__TT_BRIDGE_FACTORY__;

const {
  TRUSTED_HOSTS_KEY,
  CONTROLS_VISIBILITY_OPT_IN_KEY: TT_CONTROLS_VISIBILITY_OPT_IN_KEY,
  normalizeBoardHost,
  isTrustedBoardHost,
  isControlsVisibleForBoard,
} = globalThis.__TT_BOARD_UTILS__ || {};
delete globalThis.__TT_BOARD_UTILS__;

const createTTBridge = () => {
  const NUMERIC_ID = /^\d+$/;

  const isNumericId = (value) => NUMERIC_ID.test(String(value ?? ''));

  const isCurrentHost = (host) => String(host ?? '') === window.location.host;

  const sanitizeText = (value, maxLen = 200) => {
    if (value == null) return '';
    return String(value)
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, maxLen);
  };

  const sanitizeIgnoreUsers = (users) => {
    if (!Array.isArray(users)) return [];
    return users
      .filter(user => user && isNumericId(user.userID))
      .map(user => ({
        userID: String(user.userID),
        userName: sanitizeText(user.userName, 100),
        updatedAt: typeof user.updatedAt === 'number' ? user.updatedAt : Date.now(),
      }));
  };

  const sanitizeIgnoreTopics = (topics) => {
    if (!Array.isArray(topics)) return [];
    return topics
      .filter(topic => topic && isNumericId(topic.topicID))
      .map(topic => ({
        topicID: String(topic.topicID),
        topicName: sanitizeText(topic.topicName, 200),
        updatedAt: typeof topic.updatedAt === 'number' ? topic.updatedAt : Date.now(),
      }));
  };

  const checkImageURL = (url) => {
    if (!url) return false;
    return /^https?:\/\/.+\.(png|jpg|jpeg|bmp|gif|webp)$/i.test(url);
  };

  const isAllowedBoardHost = (host) => {
    if (!host || typeof host !== 'string') return false;

    const raw = host.trim().toLowerCase();
    if (!raw || raw.length > 253) return false;

    let hostname = raw;

    if (raw.startsWith('[')) return false;

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

  return {
    isNumericId,
    isCurrentHost,
    sanitizeText,
    sanitizeIgnoreUsers,
    sanitizeIgnoreTopics,
    checkImageURL,
    isAllowedBoardHost,
  };
};

const sameId = (a, b) => `${a ?? ''}` === `${b ?? ''}`;
const hasValidBoardId = (value) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
};
const controlsScopeKey = (boardID, boardUrl) => {
  if (hasValidBoardId(boardID)) return `${boardID}`;
  const host = normalizeBoardHost(boardUrl || window.location.host);
  if (host) return `host:${host}`;
  return null;
};

/** @param {HTMLElement} post */
const resolvePostUserId = (post) => {
  const dataId = `${post.dataset.userId || ''}`.trim();
  if (/^\d+$/.test(dataId)) return dataId;

  const profileLink = post.querySelector('a[href*="profile.php?id="]');
  if (profileLink instanceof HTMLAnchorElement) {
    const href = profileLink.getAttribute('href') || '';
    const match = href.match(/[?&]id=(\d+)/i);
    if (match?.[1]) return match[1];
  }

  const nested = post.querySelector('[data-user-id]');
  if (nested instanceof HTMLElement) {
    const nestedId = `${nested.dataset.userId || ''}`.trim();
    if (/^\d+$/.test(nestedId)) return nestedId;
  }

  return '';
};

const ttFallback = (() => {
  const debugState = {
    host: normalizeBoardHost(window.location.host),
    controlsVisible: true,
    ignoredUsersCount: 0,
    ignoredTopicsCount: 0,
  };

  return {
    setControlsVisible(visible) {
      // do nothing
    },
    setIgnoredUsers(users) {
      // do nothing
    },
    setIgnoredTopics(topics) {
      // do nothing
    },
    getDebugState() {
      return { ...debugState };
    },
  };
})();

const bootstrapFallbackByHost = async () => {
  const host = normalizeBoardHost(window.location.host);
  if (!host) return;

  try {
    const [storage, localStore] = await Promise.all([
      isoSafeStorageGet([ 'ignoreList', 'ignoredTopicsList' ]),
      chrome.storage.local.get([ 'controlsVisibilityByBoard' ]),
    ]);

    const map = localStore?.controlsVisibilityByBoard || {};
    const hostKey = `host:${host}`;
    if (Object.prototype.hasOwnProperty.call(map, hostKey)) {
      ttFallback.setControlsVisible(map[hostKey] !== false);
    }

    const ignoreBoards = (storage?.ignoreList || []).filter(item =>
      normalizeBoardHost(item?.boardUrl) === host,
    );
    const users = ignoreBoards
      .flatMap(board => (board?.forums || []).flatMap(forum => forum?.users || []))
      .filter(item => item && item.userID != null);
    const uniqueUsers = Array.from(new Map(users.map(item => [ `${item.userID}`, item ])).values());
    ttFallback.setIgnoredUsers(uniqueUsers);

    const topicBoards = (storage?.ignoredTopicsList || []).filter(item =>
      normalizeBoardHost(item?.boardUrl) === host,
    );
    const topics = topicBoards
      .flatMap(board => board?.topics || [])
      .filter(item => item && item.topicID != null);
    const uniqueTopics = Array.from(new Map(topics.map(item => [ `${item.topicID}`, item ])).values());
    ttFallback.setIgnoredTopics(uniqueTopics);
  } catch (e) {
    // ignore
  }
};

const getReplyField = () => document.querySelector('#main-reply') || document.querySelector('textarea[name="req_message"]');

const FORUM_MARKER_ATTR = 'data-tt-forum-api';

let hasForumAPITicket = false;

const readForumMarkerAttr = () => document.documentElement.getAttribute(FORUM_MARKER_ATTR) === '1';

const hasForumAPITicketInDom = () => {
  const scripts = document.scripts;
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (script.src) continue;
    const text = script.textContent || '';
    if (/var\s+ForumAPITicket\s*=/.test(text)) return true;
  }
  return false;
};

const hasForumMarkers = () => {
  if (hasForumAPITicket) return true;
  if (readForumMarkerAttr()) {
    hasForumAPITicket = true;
    return true;
  }
  if (hasForumAPITicketInDom()) {
    hasForumAPITicket = true;
    return true;
  }
  return false;
};
const isReplyCapable = () => !!getReplyField();

const insertTextAtCursor = (field, text) => {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const before = field.value.slice(0, start);
  const after = field.value.slice(end);

  field.focus();
  field.value = `${before}${text}${after}`;

  const newPos = start + text.length;
  field.selectionStart = newPos;
  field.selectionEnd = newPos;

  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
};

let currentForumData = null;

const ttNotifyAvailability = (available) => {
  try {
    chrome?.runtime?.sendMessage({
      type: 'tundra_toolkit_availability_update',
      available: !!available,
      visible: true,
    });
  } catch (e) {
    // ignore to avoid breaking page flow
  }
};

const refreshForumMarkersFromMain = () => new Promise((resolve) => {
  // 1) SSR inline script / DOM-атрибут — синхронно, без моста
  if (hasForumMarkers()) {
    resolve(true);
    return;
  }

  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    unsubscribe();
    if (value) hasForumAPITicket = true;
    resolve(value);
  };

  const unsubscribe = ttChannel.subscribe((data) => {
    if (data.type !== 'tundra_toolkit_forum_markers') return;
    finish(!!data.hasForumAPITicket);
  });

  const timer = setTimeout(() => finish(hasForumMarkers()), 100);
  ttPost({ type: 'tundra_toolkit_forum_markers_request' });
});

let lastAvailability = null;
const reportAvailabilityIfChanged = () => {
  if (readForumMarkerAttr()) hasForumAPITicket = true;
  const available = hasForumMarkers();
  if (available === lastAvailability) return;
  lastAvailability = available;
  ttNotifyAvailability(available);
};

const readControlsVisibility = async (boardID, boardUrl) => {
  const key = controlsScopeKey(boardID, boardUrl);
  if (!key) return true;
  try {
    const stored = await chrome.storage.local.get([
      'controlsVisibilityByBoard',
      TT_CONTROLS_VISIBILITY_OPT_IN_KEY,
    ]);
    const map = stored?.controlsVisibilityByBoard || {};
    const optIn = stored?.[TT_CONTROLS_VISIBILITY_OPT_IN_KEY] === true;
    if (key.startsWith('host:')) {
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key] !== false;
      return true;
    }
    return isControlsVisibleForBoard(map, key, optIn);
  } catch (e) {
    return true;
  }
};

const readTrustedHosts = async () => {
  const { trustedBoardHosts = [] } = await isoSafeStorageGet([ TRUSTED_HOSTS_KEY ]);
  return Array.isArray(trustedBoardHosts) ? trustedBoardHosts : [];
};

const writeControlsVisibility = async (boardID, boardUrl, visible) => {
  const key = controlsScopeKey(boardID, boardUrl);
  if (!key) return;
  try {
    const stored = await chrome.storage.local.get([ 'controlsVisibilityByBoard' ]);
    const map = stored?.controlsVisibilityByBoard || {};
    map[key] = visible;
    await chrome.storage.local.set({ controlsVisibilityByBoard: map });
  } catch (e) {
    // ignore write errors to avoid breaking page flow
  }
};

const STYLE_OVERRIDE_KEY = 'styleOverrideByHost';
const POST_APPEARANCE_KEY = 'postAppearanceByHost';
const DEFAULT_POST_APPEARANCE = {
  fontScale: 100,
  firstLineIndent: false,
  paragraphSpacing: null,
};

/** @param {any} settings */
const normalizePostAppearance = (settings) => {
  const rawScale = Number(settings?.fontScale);
  const fontScale = Number.isFinite(rawScale)
    ? Math.min(140, Math.max(80, Math.round(rawScale / 10) * 10))
    : DEFAULT_POST_APPEARANCE.fontScale;
  return {
    fontScale,
    firstLineIndent: settings?.firstLineIndent === true,
    paragraphSpacing: typeof settings?.paragraphSpacing === 'number'
      ? Math.min(2, Math.max(0, Math.round(settings.paragraphSpacing * 4) / 4))
      : null,
  };
};

const getPostAppearanceApi = () => /** @type {any} */ (globalThis).__TT_POST_APPEARANCE__;

const readStyleOverride = async (boardUrl) => {
  const host = normalizeBoardHost(boardUrl || window.location.host);
  if (!host) return false;
  try {
    const stored = await chrome.storage.local.get([ STYLE_OVERRIDE_KEY ]);
    const map = stored?.[STYLE_OVERRIDE_KEY] || {};
    return map[host] === true;
  } catch (e) {
    return false;
  }
};

const writeStyleOverride = async (boardUrl, enabled) => {
  const host = normalizeBoardHost(boardUrl || window.location.host);
  if (!host) return;
  try {
    const stored = await chrome.storage.local.get([ STYLE_OVERRIDE_KEY ]);
    const map = stored?.[STYLE_OVERRIDE_KEY] || {};
    map[host] = enabled;
    await chrome.storage.local.set({ [STYLE_OVERRIDE_KEY]: map });
  } catch (e) {
    // ignore write errors to avoid breaking page flow
  }
};

/**
 * @param {any} boardUrl
 * @param {any} forumID
 */
const readPostAppearance = async (boardUrl, forumID) => {
  const host = normalizeBoardHost(boardUrl || window.location.host);
  if (!host) return { ...DEFAULT_POST_APPEARANCE };
  try {
    const stored = await chrome.storage.local.get([ POST_APPEARANCE_KEY ]);
    const map = stored?.[POST_APPEARANCE_KEY] || {};
    const hostSettings = map[host] || {};
    const sectionKey = forumID ? `${ forumID }` : null;
    return normalizePostAppearance({
      ...hostSettings,
      firstLineIndent: Boolean(sectionKey && hostSettings.firstLineIndentByForum?.[sectionKey] === true),
    });
  } catch (e) {
    return { ...DEFAULT_POST_APPEARANCE };
  }
};

/**
 * @param {any} boardUrl
 * @param {any} forumID
 * @param {any} settings
 */
const writePostAppearance = async (boardUrl, forumID, settings) => {
  const host = normalizeBoardHost(boardUrl || window.location.host);
  if (!host) return;
  try {
    const stored = await chrome.storage.local.get([ POST_APPEARANCE_KEY ]);
    const map = stored?.[POST_APPEARANCE_KEY] || {};
    const currentSettings = map[host] || {};
    const normalizedSettings = normalizePostAppearance(settings);
    const sectionKey = forumID ? `${ forumID }` : null;
    map[host] = {
      fontScale: normalizedSettings.fontScale,
      paragraphSpacing: normalizedSettings.paragraphSpacing,
      firstLineIndentByForum: sectionKey
        ? {
          ...currentSettings.firstLineIndentByForum,
          [sectionKey]: normalizedSettings.firstLineIndent,
        }
        : currentSettings.firstLineIndentByForum,
    };
    await chrome.storage.local.set({ [POST_APPEARANCE_KEY]: map });
  } catch (e) {
    // ignore write errors to avoid breaking page flow
  }
};

const ISO_FALLBACKS_KEY = '__tt_storage_fallbacks__';
const ISO_FAVORITES_KEY = 'favoriteTopics';
const ISO_FAVORITES_CHUNKS_KEY = 'favoriteTopics__chunks';
const ISO_FAVORITES_CHUNK_PREFIX = 'favoriteTopics__chunk_';
const ISO_FAVORITES_CHUNK_TARGET_BYTES = 7500;
const isoIsQuotaError = (error) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${error}`;
  return /QUOTA_BYTES_PER_ITEM|quota.*bytes/i.test(message);
};

const isoReadFallbacks = async () => {
  try {
    const data = await chrome.storage.sync.get(ISO_FALLBACKS_KEY);
    return data?.[ISO_FALLBACKS_KEY] || {};
  } catch (e) {
    return {};
  }
};

const isoWriteFallbacks = async (fallbacks) => {
  try {
    await chrome.storage.sync.set({ [ISO_FALLBACKS_KEY]: fallbacks });
  } catch (e) {
    // ignore
  }
};

const isoSerializedBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const isoSplitFavorites = (items) => {
  const chunks = [];
  let current = [];

  items.forEach(item => {
    const candidate = [ ...current, item ];
    if (current.length && isoSerializedBytes(candidate) > ISO_FAVORITES_CHUNK_TARGET_BYTES) {
      chunks.push(current);
      current = [ item ];
    } else {
      current = candidate;
    }
  });

  if (current.length) chunks.push(current);
  return chunks;
};
const isoFavoriteChunkKeys = (count) =>
  Array.from({ length: count }, (_, index) => `${ ISO_FAVORITES_CHUNK_PREFIX }${ index }`);
const isoWriteChunkedFavorites = async (items, fallbacks) => {
  const previous = await chrome.storage.sync.get(ISO_FAVORITES_CHUNKS_KEY);
  const previousCount = Number(previous?.[ISO_FAVORITES_CHUNKS_KEY]?.count) || 0;
  const chunks = isoSplitFavorites(items);
  const chunkData = Object.fromEntries(
    chunks.map((chunk, index) => [ `${ ISO_FAVORITES_CHUNK_PREFIX }${ index }`, chunk ]),
  );

  try {
    await chrome.storage.sync.set({
      ...chunkData,
      [ISO_FAVORITES_CHUNKS_KEY]: { version: 1, count: chunks.length },
    });
    const staleChunkKeys = isoFavoriteChunkKeys(previousCount).slice(chunks.length);
    await chrome.storage.sync.remove([ ISO_FAVORITES_KEY, ...staleChunkKeys ]);
    delete fallbacks[ISO_FAVORITES_KEY];
    await isoWriteFallbacks(fallbacks);
    await chrome.storage.local.remove([
      ISO_FAVORITES_KEY,
      ISO_FAVORITES_CHUNKS_KEY,
      ...isoFavoriteChunkKeys(previousCount),
    ]);
    return 'sync';
  } catch (error) {
    if (!isoIsQuotaError(error)) throw error;
    fallbacks[ISO_FAVORITES_KEY] = 'local';
    await chrome.storage.local.set({ [ISO_FAVORITES_KEY]: items });
    await isoWriteFallbacks(fallbacks);
    return 'local';
  }
};

const isoSafeStorageSet = async (data) => {
  const hasFavorites = Object.prototype.hasOwnProperty.call(data, ISO_FAVORITES_KEY);
  const favoriteItems = hasFavorites && Array.isArray(data[ISO_FAVORITES_KEY]) ? data[ISO_FAVORITES_KEY] : [];
  const regularData = { ...data };
  delete regularData[ISO_FAVORITES_KEY];
  const keys = Object.keys(regularData);
  const fallbacks = await isoReadFallbacks();
  let usedFallback = false;

  if (keys.length) {
    try {
      await chrome.storage.sync.set(regularData);
      keys.forEach(key => delete fallbacks[key]);
      await isoWriteFallbacks(fallbacks);
      await chrome.storage.local.remove(keys);
    } catch (error) {
      if (!isoIsQuotaError(error)) throw error;
      keys.forEach(key => { fallbacks[key] = 'local'; });
      await chrome.storage.local.set(regularData);
      await isoWriteFallbacks(fallbacks);
      usedFallback = true;
    }
  }

  if (hasFavorites) {
    const location = await isoWriteChunkedFavorites(favoriteItems, fallbacks);
    usedFallback ||= location === 'local';
  }

  return usedFallback ? 'local' : 'sync';
};

const isoSafeStorageGet = async (keys) => {
  const fallbacks = await isoReadFallbacks();
  const wantsFavorites = keys.includes(ISO_FAVORITES_KEY);
  const regularKeys = keys.filter(key => key !== ISO_FAVORITES_KEY);
  const syncKeys = wantsFavorites
    ? [ ...regularKeys, ISO_FAVORITES_KEY, ISO_FAVORITES_CHUNKS_KEY ]
    : regularKeys;
  const localKeys = wantsFavorites ? [ ...regularKeys, ISO_FAVORITES_KEY ] : regularKeys;
  const [syncData, localData] = await Promise.all([
    syncKeys.length ? chrome.storage.sync.get(syncKeys) : Promise.resolve({}),
    localKeys.length ? chrome.storage.local.get(localKeys) : Promise.resolve({}),
  ]);

  const result = {};
  regularKeys.forEach(key => {
    if (fallbacks[key] === 'local') {
      result[key] = localData?.[key];
    } else {
      result[key] = syncData?.[key] ?? localData?.[key];
    }
  });

  if (wantsFavorites) {
    if (fallbacks[ISO_FAVORITES_KEY] === 'local') {
      const localFavorites = localData?.[ISO_FAVORITES_KEY];
      result[ISO_FAVORITES_KEY] = localFavorites;
      if (Array.isArray(localFavorites)) {
        try {
          await isoWriteChunkedFavorites(localFavorites, fallbacks);
        } catch (e) {
          // Keep local data readable if migration is temporarily unavailable.
        }
      }
    } else {
      const count = Number(syncData?.[ISO_FAVORITES_CHUNKS_KEY]?.count) || 0;
      if (syncData?.[ISO_FAVORITES_CHUNKS_KEY] && count >= 0) {
        const chunkData = count
          ? await chrome.storage.sync.get(isoFavoriteChunkKeys(count))
          : {};
        result[ISO_FAVORITES_KEY] = isoFavoriteChunkKeys(count)
          .flatMap(key => Array.isArray(chunkData[key]) ? chunkData[key] : []);
      } else {
        const legacyFavorites = syncData?.[ISO_FAVORITES_KEY] ?? localData?.[ISO_FAVORITES_KEY];
        result[ISO_FAVORITES_KEY] = legacyFavorites;
        if (Array.isArray(syncData?.[ISO_FAVORITES_KEY])) {
          try {
            await isoWriteChunkedFavorites(syncData[ISO_FAVORITES_KEY], fallbacks);
          } catch (e) {
            // Keep legacy data readable if migration is temporarily unavailable.
          }
        }
      }
    }
  }

  return result;
};

reportAvailabilityIfChanged();
const availabilityObserver = new MutationObserver(() => {
  reportAvailabilityIfChanged();
  if (lastAvailability) availabilityObserver.disconnect();
});
availabilityObserver.observe(document.documentElement, { childList: true, subtree: true });
bootstrapFallbackByHost();

try {
  globalThis.__ttDebug = {
    get: () => ttFallback.getDebugState(),
  };
} catch (e) {
  // ignore
}

const bridge = createTTBridge();
const ttChannel = __ttFactory?.bridge
  || (__ttFactory?.createBridge ? __ttFactory.createBridge('isolated') : null)
  || {
    post: () => false,
    subscribe: () => () => {},
    whenReady: () => {},
    isReady: () => false,
  };

const ttPost = (payload) => {
  ttChannel.post(payload);
};

let lastInitData = null;

const processForumInit = async (data) => {
  const {
    boardID,
    forumID,
    userID,
    topicID,
    topicName,
    needsTopicIgnore,
  } = data;

  const boardUrl = window.location.host;
  const normalizedHost = normalizeBoardHost(boardUrl);
  const hasForum = hasForumMarkers();
  const trustedHosts = await readTrustedHosts();
  const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
  const available = hasForum && bridge.isAllowedBoardHost(boardUrl) && isTrusted;

  currentForumData = { boardID, userID, forumID, boardUrl, topicID, topicName };
  lastAvailability = available;
  ttNotifyAvailability(available);

  readControlsVisibility(`${ boardID }`, boardUrl).then(visible => {
    ttFallback.setControlsVisible(visible);
    ttPost({
      type: 'tundra_toolkit_controls_visibility',
      visible,
    });
    try {
      chrome?.runtime?.sendMessage?.({
        type: 'tundra_toolkit_controls_visibility',
        visible,
      });
    } catch (e) {
      // ignore
    }
  });

  if (isTrusted && globalThis.__TT_STYLE_OVERRIDE__ && !globalThis.__TT_STYLE_OVERRIDE__.isEnabled()) {
    readStyleOverride(boardUrl).then(enabled => {
      if (enabled) globalThis.__TT_STYLE_OVERRIDE__?.setEnabled(true);
    });
  } else if (!isTrusted && globalThis.__TT_STYLE_OVERRIDE__?.isEnabled()) {
    globalThis.__TT_STYLE_OVERRIDE__.setEnabled(false);
  }

  if (available && getPostAppearanceApi()) {
    readPostAppearance(boardUrl, forumID).then(settings => {
      getPostAppearanceApi()?.apply(settings);
    });
  } else if (getPostAppearanceApi()) {
    getPostAppearanceApi().apply(DEFAULT_POST_APPEARANCE);
  }

  if (!bridge.isAllowedBoardHost(boardUrl)) return;

  isoSafeStorageSet({
    forumData: {
      boardID,
      userID,
      forumID,
    },
  });

  if (!isTrusted) return;

  if (topicID) {
    isoSafeStorageGet(['favoriteTopics']).then(({ favoriteTopics = [] }) => {
      let changed = false;
      const seenAt = Math.floor(Date.now() / 1000);
      const updated = favoriteTopics.map(item => {
        if (item.boardUrl !== boardUrl || `${ item.topicID }` !== `${ topicID }`) return item;
        changed = true;
        return {
          ...item,
          lastSeenPostDate: seenAt,
          seenNumReplies: item.numReplies,
          updatedAt: Date.now(),
        };
      });
      if (changed) {
        isoSafeStorageSet({
          favoriteTopics: updated.filter(item => bridge.isAllowedBoardHost(item.boardUrl)),
        });
      }
    });
  }

  ttPost({ type: 'tundra_toolkit_enable_unsafe' });

  isoSafeStorageGet(['ignoreList']).then(({ ignoreList = [] }) => {
    const boardList = ignoreList.find(item => item.boardID === boardID);
    const forumList = boardList?.forums.find(item => item.forumID === forumID)?.users || [];

    ttPost({
      type: 'tundra_toolkit_init_ignore',
      forumData: {
        boardID,
        forumID,
        userID,
      },
      data: forumList,
    });
  });

  if (needsTopicIgnore) {
    isoSafeStorageGet(['ignoredTopicsList']).then(({ ignoredTopicsList = [] }) => {
      const boardList = ignoredTopicsList.find(item => item.boardID === boardID);
      const topics = boardList?.topics || [];

      ttPost({
        type: 'tundra_toolkit_init_topic_ignore',
        boardData: { boardID },
        data: topics,
      });
    });
  }
};

ttChannel.subscribe((data) => {
  if (data.type === 'tundra_toolkit_forum_markers') {
    hasForumAPITicket = !!data.hasForumAPITicket;
    reportAvailabilityIfChanged();
    return;
  }

  if (data.type === 'tundra_toolkit_init_data') {
    hasForumAPITicket = true;

    const {
      boardID,
      forumID,
      userID,
      topicID,
      topicName,
      needsTopicIgnore,
    } = data;

    if (!bridge.isNumericId(boardID) || !bridge.isNumericId(userID)) return;
    if (forumID != null && !bridge.isNumericId(forumID)) return;
    if (topicID != null && !bridge.isNumericId(topicID)) return;

    lastInitData = data;
    processForumInit(data);
    return;
  }

  if (data.type === 'tundra_toolkit_update_ignore_list') {
    const {
      boardID,
      boardName,
      boardUrl,
      forumID,
      forumName,
      data: newUsers,
    } = data;

    isoSafeStorageGet(['ignoreList']).then(({ ignoreList = [] }) => {
      const boardIndex = ignoreList.findIndex(item => item.boardID === boardID);

      const newData = boardIndex >= 0 ? ignoreList.map(board => {
        if (board.boardID !== boardID) return board;
        const forumIndex = board.forums.findIndex(item => item.forumID === forumID);

        const newForumData = forumIndex >= 0 ? board.forums.map(forum => {
          if (forum.forumID !== forumID) return forum;

          return {
            ...forum,
            users: newUsers,
          };
        }) : [
          ...board.forums,
          {
            forumID,
            forumName,
            users: newUsers,
          },
        ];

        return {
          ...board,
          forums: newForumData,
        };
      }) : [
        ...ignoreList,
        {
          boardID,
          boardName,
          boardUrl,
          forums: [
            {
              forumID,
              forumName,
              users: newUsers,
            },
          ],
        },
      ];

      isoSafeStorageSet({
        ignoreList: newData,
      });
    });
  }

  if (data.type === 'tundra_toolkit_update_topic_ignore_list') {
    const {
      boardID,
      boardName,
      boardUrl,
      data: newTopics,
    } = data;

    isoSafeStorageGet(['ignoredTopicsList']).then(({ ignoredTopicsList = [] }) => {
      const boardIndex = ignoredTopicsList.findIndex(item => item.boardID === boardID);

      const newData = boardIndex >= 0 ? ignoredTopicsList.map(board => {
        if (board.boardID !== boardID) return board;

        return {
          ...board,
          topics: newTopics,
        };
      }) : [
        ...ignoredTopicsList,
        {
          boardID,
          boardName,
          boardUrl,
          topics: newTopics,
        },
      ];

      isoSafeStorageSet({
        ignoredTopicsList: newData,
      });
    });
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'tundra_toolkit_templates_can_use') {
    const canUse = isReplyCapable();
    sendResponse({ canUse });
    return;
  }

  if (request.type === 'tundra_toolkit_availability_ping') {
    const boardUrl = currentForumData?.boardUrl || window.location.host;
    const boardID = currentForumData?.boardID ? `${ currentForumData.boardID }` : null;

    refreshForumMarkersFromMain().then((hasForum) => {
      Promise.all([
        readTrustedHosts(),
        readControlsVisibility(boardID, boardUrl),
        readStyleOverride(boardUrl),
      ]).then(([ trustedHosts, visible, styleOverrideEnabled ]) => {
        ttFallback.setControlsVisible(visible);
        const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
        const available = hasForum && bridge.isAllowedBoardHost(boardUrl) && isTrusted;
        sendResponse({ available, hasForum, isTrusted, boardUrl, visible, styleOverrideEnabled });
      }).catch(() => {
        sendResponse({
          available: false,
          hasForum,
          isTrusted: false,
          boardUrl,
          visible: false,
          styleOverrideEnabled: false,
        });
      });
    }).catch(() => {
      sendResponse({
        available: false,
        hasForum: false,
        isTrusted: false,
        boardUrl,
        visible: false,
        styleOverrideEnabled: false,
      });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_trust_board') {
    const host = normalizeBoardHost(request.boardUrl || window.location.host);
    const currentHost = normalizeBoardHost(window.location.host);
    if (!host || host !== currentHost || !bridge.isAllowedBoardHost(host)) {
      sendResponse({ success: false });
      return;
    }

    Promise.resolve().then(async () => {
      if (lastInitData) {
        await processForumInit(lastInitData);
      } else if (hasForumMarkers()) {
        const trustedHosts = await readTrustedHosts();
        currentForumData = {
          ...(currentForumData || {}),
          boardUrl: host,
        };
        const available = isTrustedBoardHost(host, trustedHosts);
        lastAvailability = available;
        ttNotifyAvailability(available);
        ttPost({ type: 'tundra_toolkit_request_init' });
      }

      sendResponse({ success: true, isTrusted: true });
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_untrust_board') {
    const host = normalizeBoardHost(request.boardUrl || window.location.host);
    const currentHost = normalizeBoardHost(window.location.host);
    if (!host || host !== currentHost) {
      sendResponse({ success: false });
      return;
    }

    lastAvailability = false;
    ttNotifyAvailability(false);
    ttPost({ type: 'tundra_toolkit_controls_visibility', visible: false });
    ttPost({ type: 'tundra_toolkit_disable_unsafe' });
    getPostAppearanceApi()?.apply(DEFAULT_POST_APPEARANCE);

    sendResponse({ success: true, isTrusted: false, reload: true });

    setTimeout(() => {
      try {
        window.location.reload();
      } catch (e) {
        // ignore
      }
    }, 50);
    return;
  }

  if (request.type === 'tundra_toolkit_open_post_counter') {
    const boardUrl = window.location.host;

    readTrustedHosts().then((trustedHosts) => {
      const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
      const available = hasForumMarkers() && bridge.isAllowedBoardHost(boardUrl) && isTrusted;

      if (!hasForumMarkers()) {
        sendResponse({ success: false, error: 'not_forum' });
        return;
      }

      if (!available) {
        sendResponse({ success: false, error: 'not_trusted' });
        return;
      }

      try {
        document.documentElement.setAttribute(
          'data-tt-open-post-counter',
          String(Date.now()),
        );
      } catch (e) {
        // ignore
      }

      ttPost({ type: 'tundra_toolkit_enable_unsafe' });
      ttPost({ type: 'tundra_toolkit_open_post_counter' });
      sendResponse({ success: true });
    }).catch(() => {
      sendResponse({ success: false, error: 'unknown' });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_forum_info') {
    if (hasForumMarkers() && /viewtopic\.php/i.test(location.pathname)) {
      const topicID = (location.search.match(/[?&]id=(\d+)/) || [])[1] || null;
      if (topicID) {
        const heading = document.querySelector('#pun-main h1 span, #pun-main h1');
        const topicName = heading?.textContent?.trim() || null;
        currentForumData = {
          ...(currentForumData || {}),
          boardUrl: window.location.host,
          topicID: `${ topicID }`,
          topicName: topicName || currentForumData?.topicName || `Тема ${ topicID }`,
        };
      }
    }

    if (currentForumData) {
      sendResponse({ success: true, forumData: currentForumData });
      return;
    }

    isoSafeStorageGet(['forumData'])
      .then(({ forumData }) => {
        if (forumData) {
          currentForumData = {
            ...forumData,
            boardUrl: forumData.boardUrl || window.location.host,
          };
        }
        sendResponse({
          success: !!currentForumData,
          forumData: currentForumData,
        });
      })
      .catch(() => {
        sendResponse({
          success: false,
          forumData: null,
        });
      });
    return true; // async
  }

  if (request.type === 'tundra_toolkit_templates_get') {
    const field = getReplyField();

    if (!(field instanceof HTMLTextAreaElement) || !isReplyCapable()) {
      sendResponse({ success: false, error: 'not_supported' });
      return;
    }

    sendResponse({ success: true, content: field.value || '', name: document.title || '' });
    return;
  }

  if (request.type === 'tundra_toolkit_templates_insert') {
    const field = getReplyField();

    if (!(field instanceof HTMLTextAreaElement) || !isReplyCapable()) {
      sendResponse({ success: false, error: 'not_supported' });
      return;
    }

    insertTextAtCursor(field, request.content || '');
    sendResponse({ success: true });
    return;
  }

  if (request.type === 'tundra_toolkit_insert_sticker') {
    const canInsert = hasForumMarkers() || isReplyCapable();

    if (!canInsert) {
      sendResponse?.({ success: false, reason: 'not_available' });
      return;
    }

    const field = getReplyField();

    if (!(field instanceof HTMLTextAreaElement) || !isReplyCapable()) {
      sendResponse?.({ success: false, reason: 'not_supported' });
      return;
    }

    insertTextAtCursor(field, `[img]${request.src}[/img]`);
    sendResponse?.({ success: true });
    return;
  }

  if (request.type === 'tundra_toolkit_ignore_toggle') {
    ttPost({
      type: 'tundra_toolkit_ignore_toggle',
    })
  }

  if (request.type === 'tundra_toolkit_controls_toggle') {
    const boardID = request.boardID ? `${ request.boardID }` : null;
    const boardUrl = request.boardUrl || currentForumData?.boardUrl || window.location.host;
    const visible = request.visible === true;

    writeControlsVisibility(boardID, boardUrl, visible);
    ttFallback.setControlsVisible(visible);

    ttPost({
      type: 'tundra_toolkit_controls_visibility',
      visible,
    });

    try {
      chrome?.runtime?.sendMessage?.({
        type: 'tundra_toolkit_controls_visibility',
        visible,
      });
    } catch (e) {
      // ignore
    }

    sendResponse({ success: true, visible });
    return;
  }

  if (request.type === 'tundra_toolkit_style_override_toggle') {
    const boardUrl = request.boardUrl || currentForumData?.boardUrl || window.location.host;
    const enabled = request.enabled === true;

    writeStyleOverride(boardUrl, enabled);

    try {
      globalThis.__TT_STYLE_OVERRIDE__?.setEnabled(enabled);
    } catch (e) {
      // ignore
    }

    sendResponse({ success: true, enabled });
    return;
  }

  if (request.type === 'tundra_toolkit_post_appearance_update') {
    const boardUrl = request.boardUrl || currentForumData?.boardUrl || window.location.host;
    const host = normalizeBoardHost(boardUrl);
    const currentHost = normalizeBoardHost(window.location.host);
    if (!host || host !== currentHost || lastAvailability !== true) {
      sendResponse({ success: false });
      return;
    }

    const settings = normalizePostAppearance(request.settings);
    const forumID = request.forumID || currentForumData?.forumID || null;
    writePostAppearance(host, forumID, settings);
    getPostAppearanceApi()?.apply(settings);
    sendResponse({ success: true, settings });
    return;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' && area !== 'sync') return;
  if (changes?.ignoreList || changes?.ignoredTopicsList || changes?.controlsVisibilityByBoard) {
    bootstrapFallbackByHost();
  }
});
