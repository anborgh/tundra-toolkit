(function() {
'use strict';

/**
 * @typedef {{ type: string, [key: string]: any }} TTMessage
 * @typedef {{ post: (payload: TTMessage) => void, isReady: () => boolean, whenReady: (callback: () => void) => void, subscribe: (callback: (data: TTMessage) => void) => void }} TTChannel
 * @typedef {{ bridge?: TTChannel, createBridge?: (name: string) => TTChannel }} TTFactory
 */

const pageWindow = /** @type {Window & Record<string, any>} */ (window);
const pageGlobal = /** @type {typeof globalThis & Record<string, any>} */ (globalThis);

// ForumAPITicket кладётся SSR-скриптом на страницу — к document_end уже есть.
// Пишем маркер в DOM до любых early-return, чтобы isolated увидел форум без моста.
const FORUM_MARKER_ATTR = 'data-tt-forum-api';

const hasForumAPITicketInDom = () => {
  const scripts = document.scripts;
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    if (script.src) continue;
    if (/var\s+ForumAPITicket\s*=/.test(script.textContent || '')) return true;
  }
  return false;
};

const hasForumAPITicketNow = !!pageWindow.ForumAPITicket || hasForumAPITicketInDom();
try {
  if (hasForumAPITicketNow) {
    document.documentElement.setAttribute(FORUM_MARKER_ATTR, '1');
  } else {
    document.documentElement.removeAttribute(FORUM_MARKER_ATTR);
  }
} catch (e) {
  // ignore
}

const __ttFactory = /** @type {TTFactory} */ (pageGlobal.__TT_BRIDGE_FACTORY__ || {});
delete pageGlobal.__TT_BRIDGE_FACTORY__;
const createPostStats = /** @type {(args: any) => any} */ (pageGlobal.__TT_CREATE_POST_STATS__);
delete pageGlobal.__TT_CREATE_POST_STATS__;

if (!__ttFactory?.bridge && !__ttFactory?.createBridge) {
  return;
}

const ttChannel = /** @type {TTChannel} */ (__ttFactory.bridge || __ttFactory.createBridge?.('main'));

const createTTBridge = () => {
  const NUMERIC_ID = /^\d+$/;

  /** @param {any} value */
  const isNumericId = (value) => NUMERIC_ID.test(String(value ?? ''));

  /** @param {any} host */
  const isCurrentHost = (host) => String(host ?? '') === window.location.host;

  /**
   * @param {any} value
   * @param {number} [maxLen]
   */
  const sanitizeText = (value, maxLen = 200) => {
    if (value == null) return '';
    return String(value)
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, maxLen);
  };

  /** @param {any} users */
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

  /** @param {any} topics */
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

  /** @param {any} url */
  const checkImageURL = (url) => {
    if (!url) return false;
    return /^https?:\/\/.+\.(png|jpg|jpeg|bmp|gif|webp)$/i.test(url);
  };

  return {
    isNumericId,
    isCurrentHost,
    sanitizeText,
    sanitizeIgnoreUsers,
    sanitizeIgnoreTopics,
    checkImageURL,
  };
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

const bridge = createTTBridge();
/** @type {TTMessage | null} */
let pendingInitData = null;
let initDataSent = false;

/** @param {TTMessage} payload */
const ttPost = (payload) => {
  ttChannel.post(payload);
};

const trySendInitData = () => {
  if (!pendingInitData || initDataSent) return;
  if (!ttChannel.isReady()) return;
  initDataSent = true;
  ttPost(pendingInitData);
};

ttChannel.whenReady(trySendInitData);

/** HTTPS-only URL к api.php текущего хоста (не наследуем http:// страницы). */
/** @param {any} query */
const forumApiUrl = (query) => {
  const host = window.location.host;
  const q = String(query || '').replace(/^\?/, '');
  return `https://${host}/api.php?${q}`;
};

/** @param {any} query */
const fetchForumApi = async (query) => {
  const url = forumApiUrl(query);
  if (!url.startsWith('https:')) throw new Error('https_required');
  const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
  if (response.url && !response.url.startsWith('https:')) {
    throw new Error('https_required');
  }
  return response;
};

/** @param {Element | null} row */
function getTopicFromRow(row) {
  if (!row) return null;
  const tclcon = row.querySelector('.tclcon');
  if (!tclcon) return null;

  const isNew = row.classList.contains('inew');
  const titleLink = isNew
    ? row.querySelector('.tclcon > strong a:first-of-type')
    : row.querySelector('.tclcon > a:first-of-type');

  if (!titleLink) return null;

  const href = titleLink.getAttribute('href') || '';
  const match = href.match(/viewtopic\.php\?id=(\d+)/);
  if (!match) return null;

  return {
    topicID: match[1],
    topicName: titleLink.textContent.trim(),
    titleLink,
    tclcon,
  };
}

const hvTopicIgnore = /** @type {any} */ ({
  ignoredTopics: [],
  boardID: null,
  boardName: null,
  boardUrl: null,
  style: null,
  buttonsVisible: true,
  /**
   * @param {any} boardData
   * @param {any} topics
   */
  init: async function (boardData, topics) {
    this.boardID = boardData.boardID;
    this.boardUrl = window.location.host;
    this.ignoredTopics = topics;
    this.buttonsVisible = localStorage.getItem('tundraTopicIgnoreButtonsVisible') !== 'false';
    await this.getBoardName();

    this.style = document.createElement('style');
    document.head.appendChild(this.style);

    this.apply();
    this.applyButtonVisibility();
    this.addIgnoreLinks();
    document.addEventListener('click', this.handleClick.bind(this));
  },
  getBoardName: async function () {
    const fetchData = await fetchForumApi('method=board.get&fields=title');
    const { response: { title } } = await fetchData.json();

    this.boardName = title;
  },
  getIgnoredIds: function () {
    return new Set((/** @type {any[]} */ (this.ignoredTopics)).map(item => item.topicID));
  },
  getTopicRows: function () {
    return /** @type {NodeListOf<HTMLTableRowElement>} */ (
      document.querySelectorAll('.forum > .container > table > tbody > tr')
    );
  },
  apply: function () {
    const ignoredIds = this.getIgnoredIds();
    const rowSelector = '.forum > .container > table > tbody > tr';
    const hideSelectors = [...ignoredIds].map(id => `${rowSelector}[data-tundra-topic-id="${id}"]`);
    const defaultStyles = '#pun.ignoreDisabled .forum > .container > table > tbody > tr.tundra-hidden-topic { display: table-row !important; }\n' +
      '#pun.tundra-topic-ignore-buttons-hidden .tundra-ignore-topic { display: none; }';

    this.style.innerHTML = hideSelectors.length
      ? hideSelectors.join(', ') + ' { display: none; }\n' + defaultStyles
      : defaultStyles;

    this.getTopicRows().forEach(/** @param {HTMLElement} row */ (row) => {
      const topic = getTopicFromRow(row);
      if (!topic) return;

      row.dataset.tundraTopicId = topic.topicID;
      row.classList.toggle('tundra-hidden-topic', ignoredIds.has(topic.topicID));
    });
  },
  addIgnoreLinks: function () {
    const ignoredIds = this.getIgnoredIds();

    this.getTopicRows().forEach(/** @param {HTMLElement} row */ (row) => {
      const topic = getTopicFromRow(row);
      if (!topic || ignoredIds.has(topic.topicID)) return;
      if (row.querySelector('[data-link="ignoreTopicLink"]')) return;

      const ignoreLink = ' &nbsp;<a href="#" class="tundra-ignore-topic" data-link="ignoreTopicLink" data-topic-id="' + topic.topicID + '" title="Игнорировать тему [Tundra Toolkit]">⊘</a>';
      const byuser = topic.tclcon.querySelector('.byuser');

      if (byuser) {
        byuser.insertAdjacentHTML('afterend', ignoreLink);
      } else {
        topic.tclcon.insertAdjacentHTML('beforeend', ignoreLink);
      }
    });
  },
  applyButtonVisibility: function () {
    document.querySelector('#pun')?.classList.toggle('tundra-topic-ignore-buttons-hidden', !this.buttonsVisible);
  },
  getToggleLabel: function () {
    return this.buttonsVisible ? 'Скрыть кнопки игнора' : 'Показать кнопки игнора';
  },
  updateToggleLabels: function () {
    const label = this.getToggleLabel();
    document.querySelectorAll('[data-link="topicIgnoreToggle"]').forEach(el => {
      el.textContent = label;
    });
  },
  toggleButtons: function () {
    this.buttonsVisible = !this.buttonsVisible;
    localStorage.setItem('tundraTopicIgnoreButtonsVisible', String(this.buttonsVisible));
    this.applyButtonVisibility();
    this.updateToggleLabels();
  },
  /** @param {Event} event */
  handleClick: function (event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.link === 'topicIgnoreToggle') {
      event.preventDefault();
      this.toggleButtons();
      return;
    }

    if (target.dataset.link !== 'ignoreTopicLink') return;
    event.preventDefault();

    const { topicId } = target.dataset;
    const row = target.closest('tr');
    const topic = getTopicFromRow(row);
    if (!topic) return;

    const isConfirmed = confirm(`Игнорировать тему «${topic.topicName}»?`);
    if (!isConfirmed) return;

    this.ignoredTopics.push({ topicID: topicId, topicName: topic.topicName, updatedAt: Date.now() });
    this.apply();
    target.remove();

    ttPost({
      type: 'tundra_toolkit_update_topic_ignore_list',
      boardID: this.boardID,
      boardName: this.boardName,
      boardUrl: this.boardUrl,
      data: this.ignoredTopics,
    });
  },
});

const ttControlsVisibility = /** @type {any} */ ({
  style: null,
  visible: false,
  ensureStyle: function () {
    if (this.style) return;
    this.style = document.createElement('style');
    this.style.setAttribute('data-tundra-controls-style', 'true');
    this.style.innerHTML = '.tundra-controls-hidden .tundra-ignore-topic, .tundra-controls-hidden [data-link=\"ignoreTopicLink\"], .tundra-controls-hidden .tundra-topic-ignore-toggle, .tundra-controls-hidden [data-link=\"topicIgnoreToggle\"], .tundra-controls-hidden [data-link=\"ignoreLink\"], .tundra-controls-hidden .tundra-ignore-user, .tundra-controls-hidden .pl-email.ignore { display: none !important; }';
    document.head.appendChild(this.style);
  },
  apply: function () {
    const root = document.querySelector('#pun') || document.body;
    if (root) root.classList.toggle('tundra-controls-hidden', !this.visible);
    document.body?.classList.toggle('tundra-controls-hidden', !this.visible);
  },
  /** @param {any} visible */
  setVisible: function (visible) {
    this.visible = visible === true;
    this.ensureStyle();
    this.apply();
  },
});

const hvIgnoreList = /** @type {any} */ ({
  style: null,
  ignoreList: [],
  boardID: null,
  boardName: null,
  boardUrl: null,
  forumID: null,
  forumName: null,
  userID: null,
  /**
   * @param {any} forumData
   * @param {any} data
   */
  init: async function (forumData, data) {
    this.boardID = forumData.boardID;
    this.forumID = forumData.forumID;
    this.userID = forumData.userID;
    this.forumName = pageWindow.FORUM?.get?.('topic.forum_name') || 'Раздел';
    this.boardUrl = window.location.host;
    await this.getBoardName();

    this.ignoreList = data;

    this.style = document.createElement('style');
    document.head.appendChild(this.style);

    this.generateStyle();
    this.hideQuotes();
  },
  getBoardName: async function () {
    const fetchData = await fetchForumApi('method=board.get&fields=title');
    const { response: { title } } = await fetchData.json();

    this.boardName = title;
  },
  generateStyle: function () {
    const defaultStyles = '#pun.ignoreDisabled .post { display: block !important; }\n' +
      '#pun .post.topicpost { display: block !important; }\n' +
      '.hidden { display: none; }';
    /** @type {string[]} */
    const styleArray = [];
    (/** @type {any[]} */ (this.ignoreList)).forEach(user => {
      styleArray.push(`.post[data-user-id="${user.userID}"]`)
    });

    this.style.innerHTML = (styleArray.length ? styleArray.join(', ') + ' {display: none} \n' : '') + defaultStyles;
  },
  hideQuotes: function () {
    document.querySelectorAll('.quote-box').forEach(el => {
      const cite = el.querySelector('cite');
      if (!cite) return;

      const userNames = (/** @type {any[]} */ (this.ignoreList)).map(item => item.userName);

      userNames.forEach((/** @type {string} */ iUser) => {
        el.classList.toggle('hidden', cite.innerText.toLocaleLowerCase().includes(iUser.toLocaleLowerCase()));
      });
    });
  },
  /** @param {{ userID: any, userName: any }} user */
  addUser: function ({ userID, userName }) {
    const isConfirmed = confirm(`Игнорировать посты ${userName} в разделе [ ${this.forumName} ]?`);

    if (!isConfirmed) return;

    this.ignoreList.push({ userID, userName, updatedAt: Date.now() });
    this.generateStyle();
    this.hideQuotes();

    ttPost({
      type: 'tundra_toolkit_update_ignore_list',
      boardID: this.boardID,
      boardName: this.boardName,
      boardUrl: this.boardUrl,
      forumID: this.forumID,
      forumName: this.forumName,
      data: this.ignoreList,
    });
  },
});

let setupUnsafeFeatures = () => {};
/** @type {any} */
let postStatsApi = null;
let syncForumMarkers = () => {};
let ensureForumStarted = () => {};
/** true только после tundra_toolkit_enable_unsafe (форум включён через Power) */
let unsafeEnabled = false;

function main() {
  let started = false;

  const FORUM_MARKER_ATTR = 'data-tt-forum-api';

  /** @param {any} present */
  const writeForumMarkerAttr = (present) => {
    try {
      if (present) {
        document.documentElement.setAttribute(FORUM_MARKER_ATTR, '1');
      } else {
        document.documentElement.removeAttribute(FORUM_MARKER_ATTR);
      }
    } catch (e) {
      // ignore
    }
  };

  /** @param {any} present */
  const notifyForumMarkers = (present) => {
    writeForumMarkerAttr(present);
    ttPost({
      type: 'tundra_toolkit_forum_markers',
      hasForumAPITicket: !!present,
    });
  };

  syncForumMarkers = () => {
    notifyForumMarkers(!!pageWindow.ForumAPITicket || hasForumAPITicketInDom());
  };

  // Маркер уже выставлен на старте файла; здесь только догоняем мост + init
  const tryStart = () => {
    const ForumAPITicket = pageWindow.ForumAPITicket || (hasForumAPITicketInDom() ? true : null);
    if (!ForumAPITicket) return false;
    if (started) {
      notifyForumMarkers(true);
      return true;
    }
    started = true;

  // Данные форума и пользователя для хранения
  const boardID = pageWindow.BoardID || 0;
  const userID = pageWindow.UserID || 0;
  const forumID = pageWindow.FORUM?.get('topic.forum_id') || null;

  // Данные текущей темы для «Избранного» (только на страницах viewtopic.php)
  let topicID = null;
  let topicName = null;
  if (/viewtopic\.php/.test(location.pathname)) {
    topicID = pageWindow.FORUM?.get('topic.id') || (location.search.match(/[?&]id=(\d+)/) || [])[1] || null;
    const heading = document.querySelector('#pun-main h1 span') || document.querySelector('#pun-main h1');
    topicName = heading?.textContent?.trim() || null;
  }

  const needsTopicIgnore = /viewforum\.php|search\.php/.test(location.pathname);

  pendingInitData = {
    type: 'tundra_toolkit_init_data',
    boardID,
    userID,
    forumID,
    topicID,
    topicName,
    needsTopicIgnore,
  };

  trySendInitData();
  notifyForumMarkers(true);
  ttChannel.whenReady(syncForumMarkers);
  // Мост сам шлёт hello / ловит offer — отдельный bridge_request больше не нужен

  let unsafeReady = false;
  setupUnsafeFeatures = () => {
    // Не залипаем в состоянии «ready без API» после ошибки init
    if (unsafeReady && postStatsApi) return;

    if (!unsafeReady) {
      unsafeReady = true;

  //   render ignore link

  const ensureIgnoreUserStyle = (() => {
    let injected = false;

    return () => {
      if (injected) return;
      injected = true;

      const style = document.createElement('style');
      style.setAttribute('data-tundra-ignore-user-style', 'true');
      style.innerHTML = '.tundra-ignore-user { margin-left: 6px; font-size: 12px; opacity: 0.75; text-decoration: none; } ' +
        '.tundra-ignore-user:hover { opacity: 1; }';
      document.head.appendChild(style);
    };
  })();

  /** @param {any} post */
  const addIgnoreLink = post => {
    const postUserId = post.dataset.userId;

    if (!postUserId || +postUserId === userID || postUserId === '1') return;

    const author = post.querySelector('.pa-author');
    if (!author || author.querySelector('[data-link="ignoreLink"]')) return;

    ensureIgnoreUserStyle();

    const profileLink = author.querySelector('a[href*="profile.php"]') || author.querySelector('a');
    const ignoreAnchor = `<a href="#" class="tundra-ignore-user" data-link="ignoreLink" data-user-id="${postUserId}" title="Игнорировать пользователя [Tundra Toolkit]">⊘</a>`;

    if (profileLink) {
      profileLink.insertAdjacentHTML('afterend', ` ${ignoreAnchor}`);
    } else {
      author.insertAdjacentHTML('beforeend', ignoreAnchor);
    }

    author.addEventListener('click', addUserToIgnoreList);
  }

  document.querySelectorAll('.post').forEach(addIgnoreLink);

  /** @param {any} event */
  async function addUserToIgnoreList(event) {
    if (event.target.dataset.link !== "ignoreLink") return;
    event.preventDefault();

    const { userId } = event.target.dataset;

    const fetchData = await fetch(`/api.php?method=users.get&user_id=${userId}`);
    const { response: { users: [user] } } = await fetchData.json();

    if (!user) {
      // notify
      return;
    }

    hvIgnoreList.addUser({
      userID: userId,
      userName: user.username,
    })
  }

    }

  // count posts
  if (!postStatsApi) {
    try {
      if (typeof createPostStats !== 'function') return;
      const hvPostStats = createPostStats({ fetchForumApi, userID });
      postStatsApi = hvPostStats;
      hvPostStats.init();
    } catch (e) {
      postStatsApi = null;
    }
  }
  };

    return true;
  };

  // ForumAPITicket из SSR уже в window/DOM к document_end — без ожидания загрузки
  ensureForumStarted = () => {
    tryStart();
  };

  if (!tryStart()) {
    notifyForumMarkers(false);
  }

  ttChannel.whenReady(syncForumMarkers);
}

const OPEN_POST_COUNTER_ATTR = 'data-tt-open-post-counter';

const openPostCounterUi = () => {
  try { ensureForumStarted(); } catch (e) { /* ignore */ }
  try { setupUnsafeFeatures(); } catch (e) { /* ignore */ }
  unsafeEnabled = true;
  try { postStatsApi?.openModal?.(); } catch (e) { /* ignore */ }
};

const watchOpenPostCounterAttr = () => {
  const run = () => {
    if (!document.documentElement.hasAttribute(OPEN_POST_COUNTER_ATTR)) return;
    document.documentElement.removeAttribute(OPEN_POST_COUNTER_ATTR);
    openPostCounterUi();
  };

  run();
  const observer = new MutationObserver(run);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ OPEN_POST_COUNTER_ATTR ],
  });
};

watchOpenPostCounterAttr();

ttChannel.subscribe((data) => {
  if (data.type === 'tundra_toolkit_forum_markers_request') {
    syncForumMarkers();
    return;
  }

  if (data.type === 'tundra_toolkit_request_init') {
    initDataSent = false;
    trySendInitData();
    return;
  }

  if (data.type === 'tundra_toolkit_enable_unsafe') {
    unsafeEnabled = true;
    try { ensureForumStarted(); } catch (e) { /* ignore */ }
    try { setupUnsafeFeatures(); } catch (e) { /* ignore */ }
    return;
  }

  if (data.type === 'tundra_toolkit_disable_unsafe') {
    unsafeEnabled = false;
    try { ttControlsVisibility.setVisible(false); } catch (e) { /* ignore */ }
    try {
      const modal = document.querySelector('#hvPostStatsModal');
      if (!(modal instanceof HTMLDialogElement)) return;
      if (modal?.open && typeof modal.close === 'function') modal.close();
      else if (modal) modal.removeAttribute('open');
    } catch (e) { /* ignore */ }
    return;
  }

  if (data.type === 'tundra_toolkit_open_post_counter') {
    openPostCounterUi();
    return;
  }

  if (data.type === 'tundra_toolkit_insert_sticker') {
    const src = typeof data.src === 'string' ? data.src.trim() : '';
    if (!bridge.checkImageURL(src)) return;

    const editor = pageWindow.FORUM?.get('editor') || null;

    if (!editor) {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(src);
      return;
    }

    pageWindow.smile(`[img]${src}[/img]`);
    return;
  }

  if (data.type === 'tundra_toolkit_init_ignore') {
    hvIgnoreList.init(data.forumData, data.data);
    return;
  }

  if (data.type === 'tundra_toolkit_init_topic_ignore') {
    hvTopicIgnore.init(data.boardData, data.data);
    return;
  }

  if (data.type === 'tundra_toolkit_ignore_toggle') {
    document.querySelector('#pun')?.classList.toggle('ignoreDisabled');
    return;
  }

  if (data.type === 'tundra_toolkit_controls_visibility') {
    ttControlsVisibility.setVisible(data.visible);
  }
});

// После subscribe: иначе enable_unsafe/init с моста теряются до регистрации слушателя
main();

})();