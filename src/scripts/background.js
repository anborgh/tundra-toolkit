function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tundra_toolkit_ignore_menu',
      title: 'Настройки',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'tundra_toolkit_ignore_check',
      title: 'Открыть скрытые сообщения',
      contexts: ['page'],
    });
  });
}

const CONTROLS_VISIBILITY_OPT_IN_KEY = 'controlsVisibilityOptIn';

const ensureControlsVisibilityMode = async (reason) => {
  const stored = await chrome.storage.local.get(CONTROLS_VISIBILITY_OPT_IN_KEY);
  if (stored[CONTROLS_VISIBILITY_OPT_IN_KEY] === true || stored[CONTROLS_VISIBILITY_OPT_IN_KEY] === false) {
    return;
  }
  await chrome.storage.local.set({
    [CONTROLS_VISIBILITY_OPT_IN_KEY]: reason === 'install',
  });
};

chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenus();
  ensureControlsVisibilityMode(details?.reason);
});

chrome.contextMenus.onClicked.addListener((onClickData) => {

  if (onClickData.menuItemId === 'tundra_toolkit_ignore_menu') {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  }

  if (onClickData.menuItemId === 'tundra_toolkit_ignore_check') {
    chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
      const activeTab = tabs[0];
      chrome.tabs.sendMessage(activeTab.id, {
        type: 'tundra_toolkit_ignore_toggle',
      });
    });
  }

})

const BADGE_COLOR = '#10b981';
const BADGE_TEXT_COLOR = '#ffffff';
const UNREAD_BADGE_COLOR = '#e05252';

let favoritesUnreadCount = 0;

const favoritesUnreadText = () => favoritesUnreadCount > 99 ? '99+' : `${favoritesUnreadCount}`;

const badgeTextFor = (isAvailable, isVisible) => {
  if (!isAvailable) return '';
  return isVisible === false ? '◎' : '◉';
};

const badgeState = new Map(); // tabId -> { available, visible }

const setBadgeAvailability = (tabId, isAvailable, isVisible) => {
  if (!tabId) return;

  badgeState.set(tabId, { available: isAvailable, visible: isVisible });
  // Вкладка могла закрыться — забываем её вместо «No tab with id»
  const forgetTab = () => badgeState.delete(tabId);

  // Счётчик непрочитанного приоритетен: не выставляем пер-вкладочный текст,
  // чтобы он не перекрывал глобальный бейдж со счётчиком
  if (favoritesUnreadCount > 0) {
    chrome.action.setBadgeText({ tabId, text: null })?.catch?.(forgetTab);
    return;
  }

  const text = badgeTextFor(isAvailable, isVisible);
  chrome.action.setBadgeText({ tabId, text })?.catch?.(forgetTab);
  if (isAvailable) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR })?.catch?.(forgetTab);
    chrome.action.setBadgeTextColor?.({ tabId, color: BADGE_TEXT_COLOR })?.catch?.(forgetTab);
  }
};

chrome.tabs.onRemoved.addListener(tabId => {
  badgeState.delete(tabId);
});

const applyFavoritesBadge = () => {
  const text = favoritesUnreadCount > 0 ? favoritesUnreadText() : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: favoritesUnreadCount > 0 ? UNREAD_BADGE_COLOR : BADGE_COLOR });
  chrome.action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR });

  if (favoritesUnreadCount > 0) {
    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (!tab.id) return;
        chrome.action.setBadgeText({ tabId: tab.id, text: null })?.catch?.(() => {});
      });
    });
  } else {
    // Непрочитанного нет — возвращаем вкладкам индикатор доступности
    badgeState.forEach((state, tabId) => {
      setBadgeAvailability(tabId, state.available, state.visible);
    });
  }
};

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'tundra_toolkit_availability_update') {
    setBadgeAvailability(sender?.tab?.id, Boolean(message.available), message.visible);
  }

  if (message?.type === 'tundra_toolkit_controls_visibility') {
    setBadgeAvailability(sender?.tab?.id, true, message.visible);
  }
});

const requestAvailability = (tabId) => {
  if (!tabId) return;

  try {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'tundra_toolkit_availability_ping' },
      (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        const available = Boolean(response?.available);
        if (!available) {
          setBadgeAvailability(tabId, false);
          return;
        }
        setBadgeAvailability(tabId, true, response?.visible);
      },
    );
  } catch (e) {
    // keep previous state on errors
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  requestAvailability(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  requestAvailability(tabId);
});

const BG_FALLBACKS_KEY = '__tt_storage_fallbacks__';
const bgIsQuotaError = (error) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${error}`;
  return /QUOTA_BYTES_PER_ITEM|quota.*bytes/i.test(message);
};

const bgReadFallbacks = async () => {
  try {
    const data = await chrome.storage.sync.get(BG_FALLBACKS_KEY);
    return data?.[BG_FALLBACKS_KEY] || {};
  } catch (e) {
    return {};
  }
};

const bgWriteFallbacks = async (fallbacks) => {
  try {
    await chrome.storage.sync.set({ [BG_FALLBACKS_KEY]: fallbacks });
  } catch (e) {
    // ignore
  }
};

const bgSafeStorageSet = async (data) => {
  const keys = Object.keys(data);
  const fallbacks = await bgReadFallbacks();
  try {
    await chrome.storage.sync.set(data);
    keys.forEach(key => delete fallbacks[key]);
    await bgWriteFallbacks(fallbacks);
    await chrome.storage.local.remove(keys);
    return 'sync';
  } catch (error) {
    if (bgIsQuotaError(error)) {
      keys.forEach(key => { fallbacks[key] = 'local'; });
      await chrome.storage.local.set(data);
      await bgWriteFallbacks(fallbacks);
      return 'local';
    }
    throw error;
  }
};

const bgSafeStorageGet = async (keys) => {
  const fallbacks = await bgReadFallbacks();
  const [syncData, localData] = await Promise.all([
    keys.length ? chrome.storage.sync.get(keys) : Promise.resolve({}),
    keys.length ? chrome.storage.local.get(keys) : Promise.resolve({}),
  ]);

  const result = {};
  keys.forEach(key => {
    if (fallbacks[key] === 'local') {
      result[key] = localData?.[key];
    } else {
      result[key] = syncData?.[key] ?? localData?.[key];
    }
  });

  return result;
};

const STORAGE_KEYS = [ 'ignoreList', 'ignoredTopicsList', 'stickerPack', 'templates', 'forumData' ];
const MIGRATION_DONE_KEY = 'migrationDone';
const MIGRATION_PENDING_KEY = 'migrationPending';
const MIGRATION_CONFLICTS_KEY = 'migrationConflicts';

const getUpdatedAt = (entity) => entity && typeof entity.updatedAt === 'number' ? entity.updatedAt : 0;
const pickNewer = (localValue, syncValue) => {
  return getUpdatedAt(localValue) >= getUpdatedAt(syncValue) ? localValue : syncValue;
};

const mergeById = (localList, syncList, getId) => {
  const merged = [];
  const conflicts = [];
  const seen = new Set();

  const pushOrConflict = (id, localValue, syncValue) => {
    if (localValue && !syncValue) {
      merged.push(localValue);
      return;
    }
    if (!localValue && syncValue) {
      merged.push(syncValue);
      return;
    }
    if (!localValue || !syncValue) return;

    const areSame = JSON.stringify(localValue) === JSON.stringify(syncValue);
    if (areSame) {
      merged.push(pickNewer(localValue, syncValue));
      return;
    }

    conflicts.push({ id, local: localValue, sync: syncValue });
    merged.push(pickNewer(localValue, syncValue));
  };

  localList.forEach(item => {
    const id = getId(item);
    seen.add(id);
    const match = syncList.find(i => getId(i) === id);
    pushOrConflict(id, item, match);
  });

  syncList.forEach(item => {
    const id = getId(item);
    if (seen.has(id)) return;
    pushOrConflict(id, null, item);
  });

  return { merged, conflicts };
};

const flattenIgnoreList = (data = []) => {
  const entries = [];
  data.forEach(board => {
    board.forums?.forEach(forum => {
      forum.users?.forEach(user => {
        entries.push({
          id: `${board.boardID}:${forum.forumID}:${user.userID}`,
          boardID: board.boardID,
          boardName: board.boardName,
          boardUrl: board.boardUrl,
          forumID: forum.forumID,
          forumName: forum.forumName,
          user,
        });
      });
    });
  });
  return entries;
};

const buildIgnoreList = (entries = []) => {
  const boardsMap = new Map();
  entries.forEach(entry => {
    if (!boardsMap.has(entry.boardID)) {
      boardsMap.set(entry.boardID, {
        boardID: entry.boardID,
        boardName: entry.boardName,
        boardUrl: entry.boardUrl,
        forums: new Map(),
      });
    }
    const board = boardsMap.get(entry.boardID);
    if (!board.forums.has(entry.forumID)) {
      board.forums.set(entry.forumID, {
        forumID: entry.forumID,
        forumName: entry.forumName,
        users: [],
      });
    }
    const forum = board.forums.get(entry.forumID);
    forum.users.push(entry.user);
  });

  return Array.from(boardsMap.values()).map(board => ({
    ...board,
    forums: Array.from(board.forums.values()),
  }));
};

const flattenTopics = (data = []) => {
  const entries = [];
  data.forEach(board => {
    board.topics?.forEach(topic => {
      entries.push({
        id: `${board.boardID}:${topic.topicID}`,
        boardID: board.boardID,
        boardName: board.boardName,
        boardUrl: board.boardUrl,
        topic,
      });
    });
  });
  return entries;
};

const buildTopics = (entries = []) => {
  const boardsMap = new Map();
  entries.forEach(entry => {
    if (!boardsMap.has(entry.boardID)) {
      boardsMap.set(entry.boardID, {
        boardID: entry.boardID,
        boardName: entry.boardName,
        boardUrl: entry.boardUrl,
        topics: [],
      });
    }
    const board = boardsMap.get(entry.boardID);
    board.topics.push(entry.topic);
  });
  return Array.from(boardsMap.values());
};

const mergeStickerPack = (localList = [], syncList = []) => mergeById(localList, syncList, item => item.id);
const mergeTemplates = (localList = [], syncList = []) => mergeById(localList, syncList, item => item.id);
const mergeForumData = (localValue, syncValue) => {
  if (localValue && syncValue) {
    const areSame = JSON.stringify(localValue) === JSON.stringify(syncValue);
    if (areSame) return { merged: pickNewer(localValue, syncValue), conflicts: [] };
    return {
      merged: pickNewer(localValue, syncValue),
      conflicts: [{ id: localValue.forumID || 'forumData', local: localValue, sync: syncValue }],
    };
  }
  if (localValue) return { merged: localValue, conflicts: [] };
  if (syncValue) return { merged: syncValue, conflicts: [] };
  return { merged: null, conflicts: [] };
};

const migrateStorage = async () => {
  const syncState = await bgSafeStorageGet([ MIGRATION_DONE_KEY, MIGRATION_PENDING_KEY ]);
  if (syncState[MIGRATION_DONE_KEY] || syncState[MIGRATION_PENDING_KEY]) return;

  const localData = await chrome.storage.local.get(STORAGE_KEYS);
  const syncData = await bgSafeStorageGet(STORAGE_KEYS);

  const conflictsPayload = {};
  let hasConflicts = false;

  const ignoreMerged = mergeById(flattenIgnoreList(localData.ignoreList), flattenIgnoreList(syncData.ignoreList), item => item.id);
  const topicsMerged = mergeById(flattenTopics(localData.ignoredTopicsList), flattenTopics(syncData.ignoredTopicsList), item => item.id);
  const stickerMerged = mergeStickerPack(localData.stickerPack, syncData.stickerPack);
  const templatesMerged = mergeTemplates(localData.templates, syncData.templates);
  const forumMerged = mergeForumData(localData.forumData, syncData.forumData);

  const mergedState = {
    ignoreList: buildIgnoreList(ignoreMerged.merged),
    ignoredTopicsList: buildTopics(topicsMerged.merged),
    stickerPack: stickerMerged.merged,
    templates: templatesMerged.merged,
    forumData: forumMerged.merged,
  };

  const conflicts = {
    ignoreList: ignoreMerged.conflicts,
    ignoredTopicsList: topicsMerged.conflicts,
    stickerPack: stickerMerged.conflicts,
    templates: templatesMerged.conflicts,
    forumData: forumMerged.conflicts,
  };

  Object.keys(conflicts).forEach(key => {
    if (conflicts[key]?.length) hasConflicts = true;
  });

  const payload = {
    ...mergedState,
    [MIGRATION_PENDING_KEY]: hasConflicts,
    [MIGRATION_DONE_KEY]: !hasConflicts,
  };

  if (hasConflicts) {
    payload[MIGRATION_CONFLICTS_KEY] = conflicts;
  } else {
    payload[MIGRATION_CONFLICTS_KEY] = {};
  }

  await bgSafeStorageSet(payload);
};

try {
  chrome.runtime.onStartup?.addListener(migrateStorage);
  migrateStorage();
} catch (e) {
  // ignore migration errors to avoid breaking background
}

// ===== Избранное: периодическое обновление в фоне =====

const FAVORITES_KEY = 'favoriteTopics';
const FAVORITES_META_KEY = 'favoritesRefreshMeta';
const FAVORITES_ALARM = 'tundra_toolkit_favorites_refresh';
const FAVORITES_MIN_INTERVAL_MINUTES = 2;
const FAVORITES_MAX_INTERVAL_MINUTES = 30;
const FAVORITES_MANUAL_INTERVAL_MINUTES = 1;
const FAVORITES_TARGET_REQUESTS_PER_HOUR = 120;
const FAVORITES_GUEST_USER_ID = '1';

const favEstimateRequests = (favorites = []) => {
  if (!favorites.length) return 0;
  const byBoard = new Map();
  favorites.forEach(item => {
    if (!byBoard.has(item.boardUrl)) byBoard.set(item.boardUrl, 0);
    byBoard.set(item.boardUrl, byBoard.get(item.boardUrl) + 1);
  });
  let requests = 0;
  byBoard.forEach(topicCount => {
    requests += 1; // storage.stats
    requests += Math.max(1, Math.ceil(topicCount / 100)); // topic.get
  });
  return requests;
};

// Чем больше форумов/тем — тем реже проверка (2…30 мин)
const favIntervalMinutesFor = (favorites = []) => {
  if (!favorites.length) return FAVORITES_MIN_INTERVAL_MINUTES;

  const requests = favEstimateRequests(favorites);
  const boardCount = new Set(favorites.map(item => item.boardUrl)).size;
  const minutes = Math.max(
    Math.ceil((requests * 60) / FAVORITES_TARGET_REQUESTS_PER_HOUR),
    FAVORITES_MIN_INTERVAL_MINUTES + Math.max(0, boardCount - 1) * 2,
  );

  return Math.min(
    FAVORITES_MAX_INTERVAL_MINUTES,
    Math.max(FAVORITES_MIN_INTERVAL_MINUTES, minutes),
  );
};

const scheduleFavoritesAlarm = async (favorites) => {
  const periodInMinutes = favIntervalMinutesFor(favorites);
  try {
    await chrome.alarms.clear(FAVORITES_ALARM);
    chrome.alarms.create(FAVORITES_ALARM, { periodInMinutes });
  } catch (e) {
    // ignore alarm errors
  }
  return periodInMinutes;
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

const filterFavoritesByAllowedHost = (items = []) => {
  return items.filter(item => isAllowedBoardHost(item.boardUrl));
};

const favFetchApi = async (boardUrl, query) => {
  if (!isAllowedBoardHost(boardUrl)) throw new Error('invalid_board_host');
  const url = `https://${String(boardUrl).trim().toLowerCase()}/api.php?${String(query || '').replace(/^\?/, '')}`;
  if (!url.startsWith('https:')) throw new Error('https_required');

  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
  });

  if (response.url && !response.url.startsWith('https:')) {
    throw new Error('https_required');
  }
  if (!response.ok) throw new Error(`http_${response.status}`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error?.message || 'api_error');
  return data?.response;
};

const favCheckLoggedIn = async (boardUrl) => {
  const response = await favFetchApi(boardUrl, 'method=storage.stats');
  const userId = `${response?.storage?.user_id ?? ''}`;
  return Boolean(userId) && userId !== FAVORITES_GUEST_USER_ID;
};

const favFetchTopics = async (boardUrl, topicIds) => {
  const result = new Map();
  for (let i = 0; i < topicIds.length; i += 100) {
    const chunk = topicIds.slice(i, i + 100);
    const response = await favFetchApi(
      boardUrl,
      `method=topic.get&topic_id=${chunk.join(',')}&fields=id,subject,last_post_date,last_username,num_replies`,
    );
    (Array.isArray(response) ? response : []).forEach(topic => {
      if (topic?.id) result.set(`${topic.id}`, topic);
    });
  }
  return result;
};

const favHasNew = (item) => {
  if (!item.lastPostDate) return false;
  if (!item.lastSeenPostDate) return true;
  return item.lastPostDate > item.lastSeenPostDate;
};

const favCountUnread = (favorites) => favorites.reduce((total, item) => (
  favHasNew(item) ? total + 1 : total
), 0);

const updateFavoritesUnread = async (favorites) => {
  favoritesUnreadCount = favCountUnread(favorites);
  applyFavoritesBadge();

  const metaStore = await chrome.storage.local.get(FAVORITES_META_KEY);
  const meta = metaStore?.[FAVORITES_META_KEY] || {};
  if (meta.unreadCount !== favoritesUnreadCount) {
    await chrome.storage.local.set({
      [FAVORITES_META_KEY]: { ...meta, unreadCount: favoritesUnreadCount },
    });
  }
};

const doRefreshFavorites = async (force, manual = false) => {
  const metaStore = await chrome.storage.local.get(FAVORITES_META_KEY);
  const meta = metaStore?.[FAVORITES_META_KEY] || {};
  const now = Date.now();

  const data = await bgSafeStorageGet([FAVORITES_KEY]);
  const rawFavorites = data?.[FAVORITES_KEY] || [];
  const favorites = filterFavoritesByAllowedHost(rawFavorites);

  if (favorites.length !== rawFavorites.length) {
    await bgSafeStorageSet({ [FAVORITES_KEY]: favorites });
  }

  const intervalMinutes = favIntervalMinutesFor(favorites);
  const cooldownMinutes = manual ? FAVORITES_MANUAL_INTERVAL_MINUTES : intervalMinutes;
  const cooldownMs = cooldownMinutes * 60 * 1000;

  if (!force && meta.lastRefreshAt && now - meta.lastRefreshAt < cooldownMs) {
    return {
      refreshed: false,
      lastRefreshAt: meta.lastRefreshAt,
      intervalMinutes: meta.intervalMinutes || intervalMinutes,
      manualIntervalMinutes: FAVORITES_MANUAL_INTERVAL_MINUTES,
    };
  }

  if (!favorites.length) {
    favoritesUnreadCount = 0;
    applyFavoritesBadge();
    await scheduleFavoritesAlarm([]);
    await chrome.storage.local.set({
      [FAVORITES_META_KEY]: {
        lastRefreshAt: now,
        boardStatuses: {},
        unreadCount: 0,
        intervalMinutes,
      },
    });
    return {
      refreshed: true,
      lastRefreshAt: now,
      intervalMinutes,
      manualIntervalMinutes: FAVORITES_MANUAL_INTERVAL_MINUTES,
    };
  }

  const byBoard = new Map();
  favorites.forEach(item => {
    if (!byBoard.has(item.boardUrl)) byBoard.set(item.boardUrl, []);
    byBoard.get(item.boardUrl).push(item);
  });

  const boardStatuses = {};
  const topicsByBoard = new Map();

  await Promise.all(Array.from(byBoard.entries()).map(async ([boardUrl, boardItems]) => {
    if (!isAllowedBoardHost(boardUrl)) {
      boardStatuses[boardUrl] = 'error';
      return;
    }
    try {
      const loggedIn = await favCheckLoggedIn(boardUrl);
      if (!loggedIn) {
        boardStatuses[boardUrl] = 'guest';
        return;
      }
      topicsByBoard.set(boardUrl, await favFetchTopics(boardUrl, boardItems.map(item => `${item.topicID}`)));
      boardStatuses[boardUrl] = 'ok';
    } catch (e) {
      boardStatuses[boardUrl] = 'error';
    }
  }));

  const updated = favorites.map(item => {
    const topic = topicsByBoard.get(item.boardUrl)?.get(`${item.topicID}`);
    if (!topic) return item;

    return {
      ...item,
      topicName: topic.subject || item.topicName,
      lastPostDate: Number(topic.last_post_date) || item.lastPostDate,
      lastUsername: topic.last_username || item.lastUsername,
      numReplies: Number(topic.num_replies ?? item.numReplies) || 0,
      lastCheckedAt: now,
    };
  });

  if (JSON.stringify(updated) !== JSON.stringify(favorites)) {
    await bgSafeStorageSet({ [FAVORITES_KEY]: updated });
  }

  favoritesUnreadCount = favCountUnread(updated);
  applyFavoritesBadge();
  await scheduleFavoritesAlarm(updated);

  await chrome.storage.local.set({
    [FAVORITES_META_KEY]: {
      lastRefreshAt: now,
      boardStatuses,
      unreadCount: favoritesUnreadCount,
      intervalMinutes,
    },
  });
  return {
    refreshed: true,
    lastRefreshAt: now,
    intervalMinutes,
    manualIntervalMinutes: FAVORITES_MANUAL_INTERVAL_MINUTES,
  };
};

// Сериализуем refresh: in-flight auto с длинным cooldown не должен
// «проглатывать» ручной клик с FAVORITES_MANUAL_INTERVAL_MINUTES.
let favoritesRefreshChain = Promise.resolve();

const refreshFavorites = (force = false, manual = false) => {
  const run = () => doRefreshFavorites(Boolean(force), Boolean(manual));
  const next = favoritesRefreshChain.then(run, run);
  favoritesRefreshChain = next.then(() => undefined, () => undefined);
  return next;
};

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === FAVORITES_ALARM) {
    refreshFavorites(false).catch(() => {});
  }
});

let favBadgeRecomputeTimer = null;
chrome.storage.onChanged.addListener(changes => {
  if (!changes[FAVORITES_KEY]) return;
  clearTimeout(favBadgeRecomputeTimer);
  favBadgeRecomputeTimer = setTimeout(async () => {
    try {
      const data = await bgSafeStorageGet([FAVORITES_KEY]);
      const favorites = filterFavoritesByAllowedHost(data?.[FAVORITES_KEY] || []);
      await updateFavoritesUnread(favorites);
      const intervalMinutes = await scheduleFavoritesAlarm(favorites);
      const metaStore = await chrome.storage.local.get(FAVORITES_META_KEY);
      const meta = metaStore?.[FAVORITES_META_KEY] || {};
      if (meta.intervalMinutes !== intervalMinutes) {
        await chrome.storage.local.set({
          [FAVORITES_META_KEY]: { ...meta, intervalMinutes },
        });
      }
    } catch (e) {
      // не роняем фон из-за бейджа
    }
  }, 300);
});

// Восстановление бейджа и будильника после перезапуска service worker
(async () => {
  try {
    const [metaStore, data] = await Promise.all([
      chrome.storage.local.get(FAVORITES_META_KEY),
      bgSafeStorageGet([FAVORITES_KEY]),
    ]);
    favoritesUnreadCount = Number(metaStore?.[FAVORITES_META_KEY]?.unreadCount) || 0;
    applyFavoritesBadge();
    await scheduleFavoritesAlarm(filterFavoritesByAllowedHost(data?.[FAVORITES_KEY] || []));
  } catch (e) {
    // ignore
  }
})();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'tundra_toolkit_favorites_refresh') {
    refreshFavorites(Boolean(message.force), Boolean(message.manual))
      .then(result => sendResponse({ success: true, ...result }))
      .catch(() => sendResponse({ success: false }));
    return true; // async
  }
});
