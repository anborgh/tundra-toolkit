const __ttFactory = globalThis.__TT_BRIDGE_FACTORY__;
delete globalThis.__TT_BRIDGE_FACTORY__;

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

const getReplyField = () => document.querySelector('#main-reply') || document.querySelector('textarea[name="req_message"]');

const FORUM_MARKER_ATTR = 'data-tt-forum-api';

let hasForumAPITicket = false;

const readForumMarkerAttr = () => document.documentElement.getAttribute(FORUM_MARKER_ATTR) === '1';

/** ForumAPITicket в SSR inline-скрипте в <head> — видно isolated через textContent */
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
const isForumAvailable = () => hasForumMarkers();
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
  const available = isForumAvailable();
  if (available === lastAvailability) return;
  lastAvailability = available;
  ttNotifyAvailability(available);
};

const readControlsVisibility = async (boardID) => {
  if (!boardID) return false;
  try {
    const stored = await chrome.storage.local.get([ 'controlsVisibilityByBoard' ]);
    const map = stored?.controlsVisibilityByBoard || {};
    return map[boardID] === true;
  } catch (e) {
    return false;
  }
};

const TRUSTED_HOSTS_KEY = 'trustedBoardHosts';

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

const readTrustedHosts = async () => {
  const { trustedBoardHosts = [] } = await isoSafeStorageGet([ TRUSTED_HOSTS_KEY ]);
  return Array.isArray(trustedBoardHosts) ? trustedBoardHosts : [];
};

const isUnsafeAvailable = async (boardUrl = window.location.host) => {
  if (!hasForumMarkers()) return false;
  if (!bridge.isAllowedBoardHost(boardUrl)) return false;
  const trustedHosts = await readTrustedHosts();
  return isTrustedBoardHost(boardUrl, trustedHosts);
};

const writeControlsVisibility = async (boardID, visible) => {
  if (!boardID) return;
  try {
    const stored = await chrome.storage.local.get([ 'controlsVisibilityByBoard' ]);
    const map = stored?.controlsVisibilityByBoard || {};
    map[boardID] = visible;
    await chrome.storage.local.set({ controlsVisibilityByBoard: map });
  } catch (e) {
    // ignore write errors to avoid breaking page flow
  }
};

const ISO_FALLBACKS_KEY = '__tt_storage_fallbacks__';
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

const isoSafeStorageSet = async (data) => {
  const keys = Object.keys(data);
  const fallbacks = await isoReadFallbacks();
  try {
    await chrome.storage.sync.set(data);
    keys.forEach(key => delete fallbacks[key]);
    await isoWriteFallbacks(fallbacks);
    await chrome.storage.local.remove(keys);
    return 'sync';
  } catch (error) {
    if (isoIsQuotaError(error)) {
      keys.forEach(key => { fallbacks[key] = 'local'; });
      await chrome.storage.local.set(data);
      await isoWriteFallbacks(fallbacks);
      return 'local';
    }
    throw error;
  }
};

const isoSafeStorageGet = async (keys) => {
  const fallbacks = await isoReadFallbacks();
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

// Initial badge state + watch for late markers/DOM
reportAvailabilityIfChanged();
const availabilityObserver = new MutationObserver(() => {
  reportAvailabilityIfChanged();
  if (lastAvailability) availabilityObserver.disconnect();
});
availabilityObserver.observe(document.documentElement, { childList: true, subtree: true });

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
  const hasForum = hasForumMarkers();
  const trustedHosts = await readTrustedHosts();
  const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
  const available = hasForum && bridge.isAllowedBoardHost(boardUrl) && isTrusted;

  currentForumData = { boardID, userID, forumID, boardUrl, topicID, topicName };
  lastAvailability = available;
  ttNotifyAvailability(available);

  readControlsVisibility(`${ boardID }`).then(visible => {
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
      data: bridge.sanitizeIgnoreUsers(forumList),
    });
  });

  if (needsTopicIgnore) {
    isoSafeStorageGet(['ignoredTopicsList']).then(({ ignoredTopicsList = [] }) => {
      const boardList = ignoredTopicsList.find(item => item.boardID === boardID);
      const topics = boardList?.topics || [];

      ttPost({
        type: 'tundra_toolkit_init_topic_ignore',
        boardData: { boardID },
        data: bridge.sanitizeIgnoreTopics(topics),
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
        readControlsVisibility(boardID),
      ]).then(([ trustedHosts, visible ]) => {
        const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
        const available = hasForum && bridge.isAllowedBoardHost(boardUrl) && isTrusted;
        sendResponse({ available, hasForum, isTrusted, boardUrl, visible });
      }).catch(() => {
        sendResponse({
          available: false,
          hasForum,
          isTrusted: false,
          boardUrl,
          visible: false,
        });
      });
    }).catch(() => {
      sendResponse({
        available: false,
        hasForum: false,
        isTrusted: false,
        boardUrl,
        visible: false,
      });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_trust_board') {
    const host = normalizeBoardHost(request.boardUrl || window.location.host);
    if (!host) {
      sendResponse({ success: false });
      return;
    }

    readTrustedHosts().then(async (trustedHosts) => {
      if (!isTrustedBoardHost(host, trustedHosts)) {
        await isoSafeStorageSet({
          [TRUSTED_HOSTS_KEY]: [ ...trustedHosts, host ],
        });
      }

      if (lastInitData) {
        await processForumInit(lastInitData);
      } else if (hasForumMarkers()) {
        const trustedHosts = await readTrustedHosts();
        currentForumData = {
          ...(currentForumData || {}),
          boardUrl: host,
        };
        const available = bridge.isAllowedBoardHost(host) && isTrustedBoardHost(host, trustedHosts);
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
    if (!host) {
      sendResponse({ success: false });
      return;
    }

    readTrustedHosts().then(async (trustedHosts) => {
      await isoSafeStorageSet({
        [TRUSTED_HOSTS_KEY]: trustedHosts.filter(item => normalizeBoardHost(item) !== host),
      });

      lastAvailability = false;
      ttNotifyAvailability(false);

      sendResponse({ success: true, isTrusted: false });
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_post_counter_status') {
    const hasForum = hasForumMarkers();
    const boardUrl = currentForumData?.boardUrl || window.location.host;
    const onProfile = !!document.querySelector('#viewprofile-next');

    readTrustedHosts().then((trustedHosts) => {
      const isTrusted = isTrustedBoardHost(boardUrl, trustedHosts);
      const available = hasForum && bridge.isAllowedBoardHost(boardUrl) && isTrusted;
      sendResponse({ hasForum, available, onProfile });
    }).catch(() => {
      sendResponse({ hasForum, available: false, onProfile });
    });
    return true;
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

      // 1) DOM-сигнал для MAIN content script
      try {
        document.documentElement.setAttribute(
          'data-tt-open-post-counter',
          String(Date.now()),
        );
      } catch (e) {
        // ignore
      }

      // 2) Inject в page JS world — вызывает window.__ttOpenPostCounter из MAIN
      try {
        const script = document.createElement('script');
        script.textContent = 'try{window.__ttOpenPostCounter&&window.__ttOpenPostCounter()}catch(e){}';
        (document.documentElement || document.head).appendChild(script);
        script.remove();
      } catch (e) {
        // ignore
      }

      // 3) Дубль через мост
      ttPost({ type: 'tundra_toolkit_open_post_counter' });

      // 4) Isolated шарит DOM — сам открывает dialog, если MAIN уже создал
      const tryShowExisting = () => {
        const modal = document.querySelector('#hvPostStatsModal');
        if (!modal) return false;
        try {
          if (typeof modal.showModal === 'function') {
            if (!modal.open) modal.showModal();
          } else {
            modal.setAttribute('open', '');
          }
          return true;
        } catch (e) {
          return false;
        }
      };
      tryShowExisting();
      setTimeout(tryShowExisting, 50);
      setTimeout(tryShowExisting, 200);

      sendResponse({ success: true });
    }).catch(() => {
      sendResponse({ success: false, error: 'unknown' });
    });
    return true;
  }

  if (request.type === 'tundra_toolkit_forum_info') {
    if (currentForumData) {
      sendResponse({ success: true, forumData: currentForumData });
      return;
    }

    if (hasForumMarkers() && /viewtopic\.php/i.test(location.pathname)) {
      const topicID = (location.search.match(/[?&]id=(\d+)/) || [])[1] || null;
      const heading = document.querySelector('#pun-main h1 span, #pun-main h1');
      const topicName = heading?.textContent?.trim() || null;
      if (topicID) {
        const forumData = {
          boardUrl: window.location.host,
          topicID: `${ topicID }`,
          topicName: topicName || `Тема ${ topicID }`,
        };
        currentForumData = forumData;
        sendResponse({ success: true, forumData });
        return;
      }
    }

    isoSafeStorageGet(['forumData'])
      .then(({ forumData }) => {
        currentForumData = forumData || null;
        sendResponse({
          success: !!forumData,
          forumData: forumData || null,
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

    sendResponse({ success: true, content: field.value || '' });
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
    const canInsert = isForumAvailable() || isReplyCapable();

    if (!canInsert) {
      sendResponse?.({ success: false, reason: 'not_available' });
      return;
    }

    ttPost({
      type: 'tundra_toolkit_insert_sticker',
      src: request.src,
    });
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
    const visible = request.visible === true;

    if (boardID) {
      writeControlsVisibility(boardID, visible);
    }

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

    return;
  }
});
