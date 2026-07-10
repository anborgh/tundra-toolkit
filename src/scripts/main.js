function getTopicFromRow(row) {
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

const hvTopicIgnore = {
  ignoredTopics: [],
  boardID: null,
  boardName: null,
  boardUrl: null,
  style: null,
  buttonsVisible: true,
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
    const fetchData = await fetch('/api.php?method=board.get&fields=title');
    const { response: { title } } = await fetchData.json();

    this.boardName = title;
  },
  getIgnoredIds: function () {
    return new Set(this.ignoredTopics.map(item => item.topicID));
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

    this.getTopicRows().forEach(row => {
      const topic = getTopicFromRow(row);
      if (!topic) return;

      row.dataset.tundraTopicId = topic.topicID;
      row.classList.toggle('tundra-hidden-topic', ignoredIds.has(topic.topicID));
    });
  },
  addIgnoreLinks: function () {
    const ignoredIds = this.getIgnoredIds();

    this.getTopicRows().forEach(row => {
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
  handleClick: function (event) {
    if (event.target.dataset.link === 'topicIgnoreToggle') {
      event.preventDefault();
      this.toggleButtons();
      return;
    }

    if (event.target.dataset.link !== 'ignoreTopicLink') return;
    event.preventDefault();

    const { topicId } = event.target.dataset;
    const row = event.target.closest('tr');
    const topic = getTopicFromRow(row);
    if (!topic) return;

    const isConfirmed = confirm(`Игнорировать тему «${topic.topicName}»?`);
    if (!isConfirmed) return;

    this.ignoredTopics.push({ topicID: topicId, topicName: topic.topicName, updatedAt: Date.now() });
    this.apply();
    event.target.remove();

    window.postMessage({
      type: 'tundra_toolkit_update_topic_ignore_list',
      boardID: this.boardID,
      boardName: this.boardName,
      boardUrl: this.boardUrl,
      data: this.ignoredTopics,
    });
  },
};

const ttControlsVisibility = {
  style: null,
  visible: true,
  ensureStyle: function () {
    if (this.style) return;
    this.style = document.createElement('style');
    this.style.setAttribute('data-tundra-controls-style', 'true');
    this.style.innerHTML = '.tundra-controls-hidden .tundra-ignore-topic, .tundra-controls-hidden [data-link=\"ignoreTopicLink\"], .tundra-controls-hidden .tundra-topic-ignore-toggle, .tundra-controls-hidden [data-link=\"topicIgnoreToggle\"], .tundra-controls-hidden [data-link=\"ignoreLink\"], .tundra-controls-hidden .pl-email.ignore { display: none !important; }';
    document.head.appendChild(this.style);
  },
  apply: function () {
    const root = document.querySelector('#pun') || document.body;
    if (root) root.classList.toggle('tundra-controls-hidden', !this.visible);
    document.body?.classList.toggle('tundra-controls-hidden', !this.visible);
  },
  setVisible: function (visible) {
    this.visible = visible !== false;
    this.ensureStyle();
    this.apply();
  },
};

const hvIgnoreList = {
  style: null,
  ignoreList: [],
  boardID: null,
  boardName: null,
  boardUrl: null,
  forumID: null,
  forumName: null,
  userID: null,
  init: async function (forumData, data) {
    this.boardID = forumData.boardID;
    this.forumID = forumData.forumID;
    this.userID = forumData.userID;
    // @ts-ignore
    this.forumName = window.FORUM.get('topic.forum_name');
    this.boardUrl = window.location.host;
    await this.getBoardName();

    this.ignoreList = data;

    this.style = document.createElement('style');
    document.head.appendChild(this.style);

    this.generateStyle();
    this.hideQuotes();
  },
  getBoardName: async function () {
    const fetchData = await fetch('/api.php?method=board.get&fields=title');
    const { response: { title } } = await fetchData.json();

    this.boardName = title;
  },
  generateStyle: function () {
    const defaultStyles = '#pun.ignoreDisabled .post { display: block !important; }\n' +
      '#pun .post.topicpost { display: block !important; }\n' +
      '.hidden { display: none; }';
    let styleArray = [];
    this.ignoreList.forEach(user => {
      styleArray.push(`.post[data-user-id="${user.userID}"]`)
    });

    this.style.innerHTML = (styleArray.length ? styleArray.join(', ') + ' {display: none} \n' : '') + defaultStyles;
  },
  hideQuotes: function () {
    document.querySelectorAll('.quote-box').forEach(el => {
      const cite = el.querySelector('cite');
      if (!cite) return;

      const userNames = this.ignoreList.map(item => item.userName);

      userNames.forEach(iUser => {
        el.classList.toggle('hidden', cite.innerText.toLocaleLowerCase().includes(iUser.toLocaleLowerCase()));
      });
    });
  },
  addUser: function ({ userID, userName }) {
    const isConfirmed = confirm(`Игнорировать посты ${userName} в разделе [ ${this.forumName} ]?`);

    if (!isConfirmed) return;

    this.ignoreList.push({ userID, userName, updatedAt: Date.now() });
    this.generateStyle();
    this.hideQuotes();

    window.postMessage({
      type: 'tundra_toolkit_update_ignore_list',
      boardID: this.boardID,
      boardName: this.boardName,
      boardUrl: this.boardUrl,
      forumID: this.forumID,
      forumName: this.forumName,
      data: this.ignoreList,
    });
  },
}

main();

function main() {
  // Проверка, на форуме mybb мы или нет
  const ForumAPITicket = window['ForumAPITicket'];
  if (!ForumAPITicket) return;

  // Данные форума и пользователя для хранения
  // @ts-ignore
  const boardID = window.BoardID || 0;
  // @ts-ignore
  const userID = window.UserID || 0;
  // @ts-ignore
  const forumID = window.FORUM?.get('topic.forum_id') || null;

  const needsTopicIgnore = /viewforum\.php|search\.php/.test(location.pathname);

  window.postMessage({
    type: 'tundra_toolkit_init_data',
    boardID,
    userID,
    forumID,
    needsTopicIgnore,
  });

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

  // count posts
  const awaitTimeout = delay => new Promise(resolve => setTimeout(resolve, delay));

  const getDate = (date) => {
    const [dateString, timeString] = date.split(' ');

    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();

    switch (dateString) {
      case 'Сегодня': {
        const today = `${formatDate(now)} ${timeString}`;
        return new Date(today);
      }
      case 'Вчера': {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const yesterdayFormatted = `${formatDate(yesterday)} ${timeString}`;
        return new Date(yesterdayFormatted);
      }
      default: {
        return new Date(date);
      }
    }
  }

  const myHeaders = new Headers();
  myHeaders.append('Content-Type', 'text/plain; charset=windows-1251');

  function transformWindows1251ToUTF8(response) {
    const transformedBody = response.body
      .pipeThrough(new TextDecoderStream("windows-1251"))
      .pipeThrough(new TextEncoderStream());
    return new Response(transformedBody);
  }

  const hvPostStats = {
    url: '',
    userIds: [],
    userMap: {},
    forums: [],
    loginHash: '',
    inputs: {
      users: null,
      forums: null,
      from: null,
      to: null,
      countChars: null,
      submit: null,
      close: null,
    },
    outputs: {
      modal: null,
      result: null,
      resultChars: null,
      resultTopics: null,
      progressWrap: null,
      progressFill: null,
      progressText: null,
    },
    result: {
      total: 0,
      profiles: {},
      topics: {},
      errors: 0,
      posts: {},
    },
    escapeHtml: function (value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    getUserLabelHtml: function (userId) {
      const profileUrl = `${this.url}/profile.php?id=${userId}`;
      const userName = this.userMap[userId];
      if (!userName) return `<a href="${profileUrl}" target="_blank">ID ${userId}</a>`;
      return `<a href="${profileUrl}" target="_blank">${this.escapeHtml(userName)}</a>`;
    },
    resolveUserMap: async function (userIds) {
      const ids = userIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0);
      const uniqueIds = [ ...new Set(ids.map(id => Number(id))) ];
      const missingIds = uniqueIds.filter((id) => !this.userMap[id]);
      if (!missingIds.length) return;

      await Promise.all(missingIds.map(async (id) => {
        try {
          const response = await fetch(`/api.php?method=users.get&user_id=${id}`);
          const data = await response.json();
          const user = data?.response?.users?.[0];
          if (user?.username) this.userMap[id] = user.username;
        } catch (error) {
          // Keep fallback label by ID if API fails for specific user.
        }
      }));
    },
    init: function () {
      this.ensureModalStyles();
      this.renderModal();

      this.inputs.users = document.querySelector('#countPostsUsers');
      this.inputs.forums = document.querySelector('#countPostsForums');
      this.inputs.from = document.querySelector('#countPostsFrom');
      this.inputs.to = document.querySelector('#countPostsTo');
      this.inputs.countChars = document.querySelector('#countChars');
      this.inputs.submit = document.querySelector('#countPostsSubmit');
      this.inputs.close = document.querySelector('#hvPostStatsModalClose');
      this.outputs.result = document.querySelector('#countPostsStats');
      this.outputs.resultChars = document.querySelector('#countPostsCharsStats');
      this.outputs.resultTopics = document.querySelector('#countPostsTopicsStats');
      this.outputs.modal = document.querySelector('#hvPostStatsModal');
      this.outputs.progressWrap = document.querySelector('#countPostsProgress');
      this.outputs.progressFill = document.querySelector('#countPostsProgressFill');
      this.outputs.progressText = document.querySelector('#countPostsProgressText');

      const hvCountPostsStorage = localStorage.getItem('hvCountPosts');
      if (hvCountPostsStorage) {
        const { userIds, users, forums, from, to } = JSON.parse(hvCountPostsStorage);
        const storageUserIds = userIds || users || [];
        this.userIds = storageUserIds.map(item => Number(item)).filter(item => Number.isFinite(item) && item > 0);
        this.inputs.users.value = this.userIds.join(', ') || '';
        this.forums = forums || [];
        this.inputs.forums.value = forums.join(', ') || '';
        this.inputs.from.value = from || '';
        this.inputs.to.value = to || '';
      }

      if (userID && !this.userIds.includes(userID)) {
        this.userIds.push(userID);
        this.inputs.users.value = this.userIds.join(', ');
      }

      const li = document.querySelector('#pa-posts strong');
      li.innerHTML += ` | <a href="#" id="hvCountPosts">TT: Счётчик постов</a>`;
      document.querySelector('#hvCountPosts').addEventListener('click', async (e) => {
        e.preventDefault();
        this.inputs.modal.open = true;
      });
      this.inputs.close.addEventListener('click', () => {
        this.inputs.modal.open = false;
      });

      const prevMonday = new Date();
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevSunday = new Date();
      this.inputs.from.value = this.inputs.from.value || prevMonday.toISOString().split("T")[0];
      this.inputs.to.value = prevSunday.toISOString().split("T")[0];
      this.inputs.from.max = new Date().toISOString().split("T")[0];
      this.inputs.to.max = new Date().toISOString().split("T")[0];

      this.inputs.submit.addEventListener('click', this.getStats.bind(this));
    },
    ensureModalStyles: function () {
      if (document.querySelector('[data-tundra-post-stats-modal-style]')) return;

      const style = document.createElement('style');
      style.setAttribute('data-tundra-post-stats-modal-style', 'true');
      style.textContent = `
        #hvPostStatsModal {
          background: transparent;
          border: none;
          box-shadow: none;
          color: #d5dbe3;
          margin: 0;
          padding: 0;
        }

        #hvPostStatsModal::backdrop {
          background: rgba(5, 10, 16, 0.78);
          backdrop-filter: blur(2px);
        }

        #hvPostStatsModal .hvPostStatsModal__content {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 90vh;
          overflow: hidden;
          padding: 18px;
          background: linear-gradient(180deg, #1f2a36 0%, #1b2430 100%);
          border: 1px solid #3a4654;
          border-radius: 12px;
          box-shadow: 0 24px 52px rgba(0, 0, 0, 0.45);
          color: #d5dbe3;
        }

        #hvPostStatsModal h2 {
          margin: 0;
          padding-right: 36px;
          color: #f2f7fc;
          font-size: 27px;
          line-height: 1.15;
          letter-spacing: 0.01em;
        }

        #hvPostStatsModal .hvPostStatsModal__form {
          display: grid;
          gap: 10px;
        }

        #hvPostStatsModal .hvPostStatsModal__formItem {
          display: grid;
          gap: 6px;
        }

        #hvPostStatsModal label {
          color: #cad5e1;
          font-weight: 500;
          font-size: 13px;
        }

        #hvPostStatsModal input[type="text"],
        #hvPostStatsModal input[type="date"] {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          background: #2f3b48;
          color: #f3f7fb;
          border: 1px solid #4d5d70;
          border-radius: 8px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        #hvPostStatsModal input[type="text"]:focus,
        #hvPostStatsModal input[type="date"]:focus {
          outline: none;
          border-color: #86a8ff;
          box-shadow: 0 0 0 2px rgba(98, 138, 255, 0.2);
          background: #344355;
        }

        #hvPostStatsModal input[type="checkbox"] {
          accent-color: #40b177;
          transform: translateY(1px);
        }

        #hvPostStatsModal .hvPostStatsModal__checkboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #d3dde8;
          user-select: none;
        }

        #hvPostStatsModal .hvPostStatsModal__close {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 32px;
          height: 32px;
          min-width: 32px;
          padding: 0;
          line-height: 1;
          border-radius: 8px;
          border: 1px solid #5a6775;
          background: #364352;
          color: #f6f9fc;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        #hvPostStatsModal .hvPostStatsModal__close:hover {
          background: #445263;
        }

        #hvPostStatsModal .hvPostStatsModal__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px rgba(98, 138, 255, 0.25);
        }

        #hvPostStatsModal .hvPostStatsModal__formRow {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        #hvPostStatsModal .hvPostStatsModal__formActions {
          display: flex;
          justify-content: flex-start;
        }

        #hvPostStatsModal #countPostsSubmit {
          min-width: 126px;
          padding: 8px 14px;
          border-radius: 8px;
          background: #38a56d;
          border: 1px solid #38a56d;
          color: #f7fbff;
          font-weight: 600;
          cursor: pointer;
        }

        #hvPostStatsModal #countPostsSubmit:hover {
          opacity: 0.92;
        }

        #hvPostStatsModal #countPostsSubmit:disabled {
          opacity: 0.6;
          cursor: default;
        }

        #hvPostStatsModal .hvPostStatsModal__progress {
          display: none;
          margin-top: -2px;
          margin-bottom: 2px;
        }

        #hvPostStatsModal #countPostsProgressText {
          margin-bottom: 6px;
          font-size: 12px;
          color: #c3ced9;
        }

        #hvPostStatsModal .hvPostStatsModal__progressBar {
          width: 100%;
          height: 10px;
          border: 1px solid #4b596b;
          border-radius: 8px;
          overflow: hidden;
          background: #26313c;
        }

        #hvPostStatsModal #countPostsProgressFill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #2f9b62 0%, #4fbe80 100%);
          transition: width 0.15s ease;
        }

        #hvPostStatsModal .hvPostStatsModal__result {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: calc(90vh - 300px);
          overflow-y: auto;
          margin-top: 2px;
          padding: 12px 14px;
          background: #26313d;
          border: 1px solid #3c4b5b;
          border-radius: 10px;
          line-height: 1.4;
        }

        #hvPostStatsModal .hvPostStatsModal__result a {
          color: #9cc8ff;
        }

        #hvPostStatsModal .hvPostStatsModal__result hr {
          margin: 10px 0;
          border: none;
          height: 1px;
          background-color: #49586a;
        }

        @media (max-width: 720px) {
          #hvPostStatsModal .hvPostStatsModal__content {
            padding: 14px;
          }

          #hvPostStatsModal h2 {
            font-size: 23px;
          }

          #hvPostStatsModal .hvPostStatsModal__formRow {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    },
    renderModal: function () {
      this.inputs.modal = document.createElement('dialog');
      this.inputs.modal.style = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; width: min(940px, calc(100vw - 32px)); max-height: 90vh;';
      this.inputs.modal.id = 'hvPostStatsModal';
      this.inputs.modal.classList.add('hvPostStatsModal');
      this.inputs.modal.innerHTML = `
        <div class="hvPostStatsModal__content">
          <button class="hvPostStatsModal__close" id="hvPostStatsModalClose" aria-label="Закрыть">×</button>
          <h2>Счётчик постов</h2>
          <div class="hvPostStatsModal__form">
            <div class="hvPostStatsModal__formItem">
              <label for="countPostsForums">ID форумов (через запятую):</label>
              <input type="text" id="countPostsForums" value="${this.forums.join(', ')}" />
            </div>
            <div class="hvPostStatsModal__formItem">
            <label for="countPostsUsers">ID пользователей (через запятую):</label>
            <input type="text" id="countPostsUsers" value="${this.userIds.join(', ')}" />
            </div>
            <div class="hvPostStatsModal__formRow">
            <div class="hvPostStatsModal__formItem">
            <label for="countPostsFrom">С:</label>
            <input type="date" id="countPostsFrom" max="" value="" />
            </div>
            <div class="hvPostStatsModal__formItem">
            <label for="countPostsTo">По:</label>
            <input type="date" id="countPostsTo" max="" value="" />
            </div>
            </div>
            <div class="hvPostStatsModal__formItem">
            <label for="countChars" class="hvPostStatsModal__checkboxLabel">
            <input type="checkbox" id="countChars" />
            считать количество символов в постах
            </label>
            </div>
            <div class="hvPostStatsModal__formActions">
            <button id="countPostsSubmit">Считать</button>
            </div>
          </div>
          <div id="countPostsProgress" class="hvPostStatsModal__progress">
            <div id="countPostsProgressText"></div>
            <div class="hvPostStatsModal__progressBar">
              <div id="countPostsProgressFill"></div>
            </div>
          </div>
          <div class="hvPostStatsModal__result">
            <div id="countPostsStats"></div>
            <div id="countPostsCharsStats"></div>
            <div id="countPostsTopicsStats"></div>
          </div>
        </div>`;
      document.body.appendChild(this.inputs.modal);
    },
    updateProgress: function (current, total, label) {
      if (!this.outputs.progressWrap || !this.outputs.progressFill || !this.outputs.progressText) return;
      const safeTotal = Math.max(total || 0, 1);
      const percent = Math.min(100, Math.max(0, Math.floor((current / safeTotal) * 100)));
      this.outputs.progressWrap.style.display = 'block';
      this.outputs.progressFill.style.width = `${percent}%`;
      this.outputs.progressText.textContent = `${label}: ${current}/${total || 0} (${percent}%)`;
    },
    hideProgress: function () {
      if (!this.outputs.progressWrap || !this.outputs.progressFill || !this.outputs.progressText) return;
      this.outputs.progressWrap.style.display = 'none';
      this.outputs.progressFill.style.width = '0%';
      this.outputs.progressText.textContent = '';
    },
    getStats: async function (event) {
      this.inputs.submit.disabled = true;
      this.outputs.result.classList.add('loading');
      this.updateProgress(0, 1, 'Подготовка');

      this.url = window.location.origin;
      this.forums = this.inputs.forums.value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(item => Number.isFinite(item) && item > 0) || [];
      this.userIds = this.inputs.users.value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(item => Number.isFinite(item) && item > 0) || [];
      const countChars = this.inputs.countChars.checked;

      if (!this.forums.length || !this.userIds.length) {
        this.inputs.submit.disabled = false;
        this.outputs.result.classList.remove('loading');
        this.outputs.result.innerHTML = 'Введите ID форумов и ID пользователей';
        this.hideProgress();
        return;
      }

      this.result = {
        total: 0,
        profiles: {},
        topics: {},
        errors: 0,
        posts: {},
      };
      this.outputs.result.innerHTML = '';
      this.outputs.resultChars.innerHTML = '';
      this.outputs.resultTopics.innerHTML = '';

      const from = this.inputs.from.value;
      const to = this.inputs.to.value;
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);

      if (!from || !to) {
        this.inputs.submit.disabled = false;
        this.outputs.result.classList.remove('loading');
        this.hideProgress();
        return;
      }

      const params = {
        forums: this.forums,
        userIds: this.userIds,
        from,
        to,
      };
      localStorage.setItem('hvCountPosts', JSON.stringify(params));

      const topicLinks = {};
      for (let i = 0; i < this.forums.length; i++) {
        if (isNaN(this.forums[i])) continue;
        try {
          topicLinks[this.forums[i]] = {
            title: '',
            links: [],
          };
          this.updateProgress(i + 1, this.forums.length, 'Собираю темы в форумах');

          const page = await fetch(`${this.url}/viewforum.php?id=${this.forums[i]}&p=-1`, { headers: myHeaders });
          const resp = transformWindows1251ToUTF8(page);
          const html = await resp.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const title = doc.querySelector('.main h1').textContent;
          topicLinks[this.forums[i]].title = title;
          const rows = doc.querySelectorAll('.forum tbody tr');
          rows.forEach((row) => {
            if (row.classList.contains('isticky')) return;
            const isNew = row.classList.contains('inew');
            const link = isNew ? row.querySelector('.tclcon > strong a:first-of-type') : row.querySelector('.tclcon > a:first-of-type');
            const href = link.getAttribute('href');
            topicLinks[this.forums[i]].links.push(href);
          });
        } catch (e) {
          if (this.result.errors > 10) {
            this.outputs.result.classList.remove('loading');
            this.inputs.submit.disabled = false;
            this.outputs.result.innerHTML = 'Ошибка';
            this.hideProgress();
            return;
          }
          this.outputs.result.innerHTML = `Ошибка, пробую ещё раз, осталось попыток: ${10 - this.result.errors}`;
          await awaitTimeout(10000);
          this.result.errors += 1;
          i--;
          continue;
        }
        await awaitTimeout(200);
      }

      const forumIds = Object.keys(topicLinks);
      const totalTopics = forumIds.reduce((total, forumId) => total + topicLinks[forumId].links.length, 0);
      let processedTopics = 0;
      for (let forumIndex = 0; forumIndex < forumIds.length; forumIndex++) {
        const forumId = forumIds[forumIndex];
        const forumTitle = topicLinks[forumId].title;
        const topics = topicLinks[forumId].links;
        let limit = 0;

        for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
          this.updateProgress(
            processedTopics + 1,
            totalTopics,
            `Считаю посты в форуме ${forumTitle}`
          );
          if (limit > 0) break;
          try {
            const url = topics[topicIndex];
            const page = await fetch(`${url}&p=-1`, { headers: myHeaders });
            const resp = transformWindows1251ToUTF8(page);
            const html = await resp.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const posts = /** @type {NodeListOf<HTMLElement>} */ (doc.querySelectorAll('.post'));
            const title = doc.querySelector('.main h1').textContent;

            const lastPost = posts[posts.length - 1];
            const lastTs = Number(lastPost.dataset.posted) * 1000;
            const lastPostDate = new Date(lastTs);
            if (lastPostDate < startDate) {
              limit = 1;
              break;
            }

            const firstPost = posts[0];
            const firstTs = Number(firstPost.dataset.posted) * 1000;
            const firstPostDate = new Date(firstTs);
            if (firstPostDate > endDate) {
              continue;
            }

            for (let postIndex = posts.length - 1; postIndex >= 0; postIndex--) {
              const post = posts[postIndex];
              if (post.classList.contains('topicpost')) break;
              const ts = Number(post.dataset.posted) * 1000;
              const postDate = new Date(ts);

              if (postDate < startDate) break;
              if (postDate > endDate) continue;

              const postUserId = Number(post.dataset.userId);
              if (!postUserId || !this.userIds.includes(postUserId)) continue;
              const userKey = String(postUserId);

              this.result.total += 1;
              if (!this.result.profiles[userKey]) {
                this.result.profiles[userKey] = 0;
              }
              this.result.profiles[userKey] += 1;
              if (countChars) {
                if (!this.result.posts[userKey]) {
                  this.result.posts[userKey] = {};
                }
                const postId = post.id.replace('p', '');
                const postUrl = `${this.url}/viewtopic.php?pid=${postId}#p${postId}`;
                const postContent = post.querySelector('.post-content');
                if (postContent) {
                  const postSig = postContent.querySelector('.post-sig');
                  if (postSig) postSig.remove();
                  const count = Math.floor(postContent.textContent.length / 1000);
                  this.result.posts[userKey][`${count}k`] = this.result.posts[userKey][`${count}k`] || [];
                  this.result.posts[userKey][`${count}k`].push(postUrl);
                }
              }

              if (!this.result.topics[url]) {
                this.result.topics[url] = {
                  count: 0,
                  title,
                };
              }
              this.result.topics[url].count += 1;
              await awaitTimeout(0);
            }
          } catch (e) {
            if (this.result.errors > 10) {
              this.inputs.submit.disabled = false;
              this.outputs.result.classList.remove('loading');
              this.outputs.result.innerHTML = 'Ошибка';
              this.hideProgress();
              return;
            }
            this.outputs.result.innerHTML = `Ошибка, пробую ещё раз, осталось попыток: ${10 - this.result.errors}`;
            await awaitTimeout(10000);
            this.result.errors += 1;
            topicIndex--;
            continue;
          }
          processedTopics += 1;
          await awaitTimeout(200);
        }
      }

      this.inputs.submit.disabled = false;
      this.outputs.result.classList.remove('loading');
      this.hideProgress();
      this.renderResult();
    },
    renderResult: async function () {
      this.outputs.result.innerHTML = '';
      this.outputs.resultChars.innerHTML = '';
      this.outputs.resultTopics.innerHTML = '';
      const from = new Date(this.inputs.from.value).toLocaleDateString('ru-RU');
      const to = new Date(this.inputs.to.value).toLocaleDateString('ru-RU');
      await this.resolveUserMap(Object.keys(this.result.profiles).map(Number));
      this.outputs.resultChars.innerHTML = `С ${from} по ${to} написали:<br>`;
      this.outputs.resultChars.innerHTML += `Эпизодов: ${Object.keys(this.result.topics).length}<br>`;
      this.outputs.resultChars.innerHTML += `Постов: ${this.result.total}<br>`;
      
      const users = Object.keys(this.result.profiles).sort((a, b) => this.result.profiles[a] - this.result.profiles[b]) || [];
      users.forEach((userId) => {
        const count = this.result.profiles[userId];
        this.outputs.resultChars.innerHTML += `${this.getUserLabelHtml(userId)}: ${count}<br>`;
      });
      
      const topics = Object.keys(this.result.topics).sort((a, b) => this.result.topics[b].count - this.result.topics[a].count) || [];
      topics.forEach((url) => {
        const { count, title } = this.result.topics[url];
        this.outputs.resultTopics.innerHTML += `${('  ' + count).slice(-3)}| <a href="${url}" target="_blank">${title}</a><br>`;
      });

      await awaitTimeout(1);

      if (this.inputs.countChars.checked) {
        this.outputs.resultTopics.innerHTML += '<hr>';
        this.outputs.resultTopics.innerHTML += `<h4>По символам</h4>`;
        
        Object.keys(this.result.posts).forEach(userId => {
          this.outputs.resultTopics.innerHTML += `${this.getUserLabelHtml(userId)}:<br>`;
          const sortedPostsByLength = Object.entries(this.result.posts[userId])
            .sort(([a], [b]) => Number.parseInt(b, 10) - Number.parseInt(a, 10));

          sortedPostsByLength.forEach(([key, posts]) => {
            this.outputs.resultTopics.innerHTML += `${key}: ${posts.length}<br>`;
            this.outputs.resultTopics.innerHTML += posts.map(post => `  <a href="${post}" target="_blank">${post}</a><br>`).join('');
          });
        });
      } 
    }
  };

  const isProfile = document.querySelector('#viewprofile-next');
  if (isProfile) hvPostStats.init();

}

window.addEventListener('message', ({ data }) => {

  if (data.type === 'tundra_toolkit_insert_sticker') {
    // @ts-ignore
    const editor = window.FORUM?.get('editor') || null;

    if (!editor) {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(data.src);
    }

    // @ts-ignore
    window.smile(`[img]${data.src}[/img]`);
  }

  if (data.type === 'tundra_toolkit_init_ignore') {
    // @ts-ignore
    const topic = window.FORUM?.get('topic') || null;
    if (!topic) return;

    hvIgnoreList.init(data.forumData, data.data);
  }

  if (data.type === 'tundra_toolkit_init_topic_ignore') {
    hvTopicIgnore.init(data.boardData, data.data);
  }

  if (data.type === 'tundra_toolkit_ignore_toggle') {
    document.querySelector('#pun')?.classList.toggle('ignoreDisabled');
  }

  if (data.type === 'tundra_toolkit_controls_visibility') {
    ttControlsVisibility.setVisible(data.visible);
  }

});