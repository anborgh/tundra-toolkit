const getReplyField = () => document.querySelector('#main-reply') || document.querySelector('textarea[name="req_message"]');
const hasForumMarkers = () => !!window['ForumAPITicket'] || !!window['FORUM'];
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

let lastAvailability = null;
const reportAvailabilityIfChanged = () => {
  const available = isForumAvailable();
  if (available === lastAvailability) return;
  lastAvailability = available;
  ttNotifyAvailability(available);
};

const readControlsVisibility = async (boardID) => {
  if (!boardID) return true;
  try {
    const stored = await chrome.storage.local.get([ 'controlsVisibilityByBoard' ]);
    const map = stored?.controlsVisibilityByBoard || {};
    return map[boardID] !== false;
  } catch (e) {
    return true;
  }
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

window.addEventListener('message', ({ data }) => {

  if (data.type === 'tundra_toolkit_init_data') {
    const {
      boardID,
      forumID,
      userID,
      needsTopicIgnore,
    } = data;

    ttNotifyAvailability(hasForumMarkers());

    // store data
    isoSafeStorageSet({
      forumData: {
        boardID,
        userID,
        forumID,
      }
    });
    currentForumData = { boardID, userID, forumID };

    readControlsVisibility(`${ boardID }`).then(visible => {
      window.postMessage({
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

    // init ignore script
    isoSafeStorageGet(['ignoreList']).then(({ ignoreList = [] }) => {
      const boardList = ignoreList.find(item => item.boardID === boardID);
      const forumList = boardList?.forums.find(item => item.forumID === forumID)?.users || [];

      window.postMessage({
        type: 'tundra_toolkit_init_ignore',
        forumData: {
          boardID,
          forumID,
          userID,
        },
        data: forumList,
      })
    });

    if (needsTopicIgnore) {
      isoSafeStorageGet(['ignoredTopicsList']).then(({ ignoredTopicsList = [] }) => {
        const boardList = ignoredTopicsList.find(item => item.boardID === boardID);
        const topics = boardList?.topics || [];

        window.postMessage({
          type: 'tundra_toolkit_init_topic_ignore',
          boardData: { boardID },
          data: topics,
        });
      });
    }

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
          }
        }) : [
          ...board.forums,
          {
            forumID,
            forumName,
            users: newUsers,
          }
        ]

        return {
          ...board,
          forums: newForumData,
        }
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
            }
          ],
        }
      ];

      isoSafeStorageSet({
        ignoreList: newData,
      })

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
    const available = isForumAvailable();
    const boardID = currentForumData?.boardID ? `${ currentForumData.boardID }` : null;
    readControlsVisibility(boardID).then(visible => {
      sendResponse({ available, visible });
    }).catch(() => {
      sendResponse({ available, visible: true });
    });
    return;
  }

  if (request.type === 'tundra_toolkit_forum_info') {
    if (currentForumData) {
      sendResponse({ success: true, forumData: currentForumData });
      return;
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

    window.postMessage({
      type: 'tundra_toolkit_insert_sticker',
      src: request.src,
    });
    sendResponse?.({ success: true });
    return;
  }

  if (request.type === 'tundra_toolkit_ignore_toggle') {
    window.postMessage({
      type: 'tundra_toolkit_ignore_toggle',
    })
  }

  if (request.type === 'tundra_toolkit_controls_toggle') {
    const boardID = request.boardID ? `${ request.boardID }` : null;
    const visible = request.visible !== false;

    if (boardID) {
      writeControlsVisibility(boardID, visible);
    }

    window.postMessage({
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
