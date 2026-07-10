function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'tundra_toolkit_ignore_menu',
      title: 'Список заблокированных',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'tundra_toolkit_ignore_check',
      title: 'Открыть скрытые сообщения',
      contexts: ['page'],
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);

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

const badgeTextFor = (isAvailable, isVisible) => {
  if (!isAvailable) return '';
  return isVisible === false ? '◎' : '◉';
};

const badgeState = new Map(); // tabId -> { available, visible }

const setBadgeAvailability = (tabId, isAvailable, isVisible) => {
  if (!tabId) return;

  badgeState.set(tabId, { available: isAvailable, visible: isVisible });
  const text = badgeTextFor(isAvailable, isVisible);
  chrome.action.setBadgeText({ tabId, text });
  if (isAvailable) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
    chrome.action.setBadgeTextColor?.({ tabId, color: BADGE_TEXT_COLOR });
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
