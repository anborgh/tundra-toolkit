(function (global) {
  'use strict';

  global.__TT_CREATE_POST_STATS__ = function createPostStats({ fetchForumApi, userID }) {
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
          const response = await fetchForumApi(`method=users.get&user_id=${id}`);
          const data = await response.json();
          const user = data?.response?.users?.[0];
          if (user?.username) this.userMap[id] = user.username;
        } catch (error) {
          // Keep fallback label by ID if API fails for specific user.
        }
      }));
    },
    init: function () {
      if (this._inited) return;

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
      this.outputs.modal = document.querySelector('#hvPostStatsModal') || this.inputs.modal;
      this.outputs.progressWrap = document.querySelector('#countPostsProgress');
      this.outputs.progressFill = document.querySelector('#countPostsProgressFill');
      this.outputs.progressText = document.querySelector('#countPostsProgressText');

      const hvCountPostsStorage = localStorage.getItem('hvCountPosts');
      if (hvCountPostsStorage) {
        try {
          const { userIds, users, forums, from, to } = JSON.parse(hvCountPostsStorage);
          const storageUserIds = userIds || users || [];
          this.userIds = storageUserIds.map(item => Number(item)).filter(item => Number.isFinite(item) && item > 0);
          if (this.inputs.users) this.inputs.users.value = this.userIds.join(', ') || '';
          this.forums = forums || [];
          if (this.inputs.forums) this.inputs.forums.value = (forums || []).join(', ') || '';
          if (this.inputs.from) this.inputs.from.value = from || '';
          if (this.inputs.to) this.inputs.to.value = to || '';
        } catch (e) {
          // ignore bad storage
        }
      }

      if (userID && !this.userIds.includes(userID)) {
        this.userIds.push(userID);
        if (this.inputs.users) this.inputs.users.value = this.userIds.join(', ');
      }

      const li = document.querySelector('#pa-posts strong');
      if (li && !document.querySelector('#hvCountPosts')) {
        li.innerHTML += ` | <a href="#" id="hvCountPosts">TT: Счётчик постов</a>`;
        document.querySelector('#hvCountPosts')?.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal();
        });
      }
      this.inputs.close?.addEventListener('click', () => {
        const modal = this.outputs.modal || this.inputs.modal;
        if (modal?.open && typeof modal.close === 'function') modal.close();
        else if (modal) modal.open = false;
      });

      const prevMonday = new Date();
      prevMonday.setDate(prevMonday.getDate() - 7);
      const prevSunday = new Date();
      if (this.inputs.from) {
        this.inputs.from.value = this.inputs.from.value || prevMonday.toISOString().split('T')[0];
        this.inputs.from.max = new Date().toISOString().split('T')[0];
      }
      if (this.inputs.to) {
        this.inputs.to.value = prevSunday.toISOString().split('T')[0];
        this.inputs.to.max = new Date().toISOString().split('T')[0];
      }

      this.inputs.submit?.addEventListener('click', this.getStats.bind(this));
      this._inited = true;
    },
    openModal: function () {
      try {
        this.init();
      } catch (e) {
        this._inited = false;
        try { this.init(); } catch (err) { return; }
      }
      const modal = this.outputs.modal || this.inputs.modal || document.querySelector('#hvPostStatsModal');
      if (!modal) return;

      const show = () => {
        try {
          if (typeof modal.showModal === 'function') {
            if (!modal.open) modal.showModal();
          } else {
            modal.setAttribute('open', '');
            modal.open = true;
          }
        } catch (e) {
          try { modal.setAttribute('open', ''); } catch (err) { /* ignore */ }
        }
      };

      show();
      setTimeout(show, 50);
      setTimeout(show, 200);
    },
    ensureModalStyles: function () {
      if (document.querySelector('[data-tundra-post-stats-modal-style]')) return;

      const style = document.createElement('style');
      style.setAttribute('data-tundra-post-stats-modal-style', 'true');
      style.textContent = `
        #hvPostStatsModal {
          --tt-post-stats-card: var(--tt-card, #ffffff);
          --tt-post-stats-card-alt: var(--tt-card-alt, #dfe5e9);
          --tt-post-stats-border: var(--tt-border, #c3ccd3);
          --tt-post-stats-muted: var(--tt-muted, #5f6b76);
          --tt-post-stats-text: var(--tt-text, #2a3138);
          --tt-post-stats-input-bg: var(--tt-input-bg, #ffffff);
          --tt-post-stats-success: var(--tt-success, #1e7c56);
          --tt-post-stats-heading: var(--font-color, var(--tt-text, #1f2933));
          --tt-post-stats-accent: var(--color-primary, #0C2028);
          --tt-post-stats-backdrop: rgba(12, 32, 40, 0.32);
          --tt-post-stats-shadow: rgba(12, 32, 40, 0.18);
          --tt-post-stats-focus: rgba(12, 32, 40, 0.18);
          --tt-post-stats-link: #2368a2;
          background: transparent;
          border: none;
          box-shadow: none;
          color: var(--tt-post-stats-text);
          margin: 0;
          padding: 0;
        }

        @media (prefers-color-scheme: dark) {
          #hvPostStatsModal {
            --tt-post-stats-card: var(--tt-card, #2d343d);
            --tt-post-stats-card-alt: var(--tt-card-alt, #252c33);
            --tt-post-stats-border: var(--tt-border, #3c4651);
            --tt-post-stats-muted: var(--tt-muted, #9aa6b5);
            --tt-post-stats-text: var(--tt-text, #c0cad4);
            --tt-post-stats-input-bg: var(--tt-input-bg, #2a3139);
            --tt-post-stats-success: var(--tt-success, #5ac193);
            --tt-post-stats-heading: var(--font-color, var(--tt-text, #f2f7fc));
            --tt-post-stats-accent: var(--color-primary, #8BA2A6);
            --tt-post-stats-backdrop: rgba(5, 10, 16, 0.78);
            --tt-post-stats-shadow: rgba(0, 0, 0, 0.45);
            --tt-post-stats-focus: rgba(139, 162, 166, 0.25);
            --tt-post-stats-link: #9cc8ff;
          }
        }

        #hvPostStatsModal::backdrop {
          background: var(--tt-post-stats-backdrop);
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
          background: linear-gradient(180deg, var(--tt-post-stats-card) 0%, var(--tt-post-stats-card-alt) 100%);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 12px;
          box-shadow: 0 24px 52px var(--tt-post-stats-shadow);
          color: var(--tt-post-stats-text);
        }

        #hvPostStatsModal h2 {
          margin: 0;
          padding-right: 36px;
          color: var(--tt-post-stats-heading);
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
          color: var(--tt-post-stats-muted);
          font-weight: 500;
          font-size: 13px;
        }

        #hvPostStatsModal input[type="text"],
        #hvPostStatsModal input[type="date"] {
          width: 100%;
          box-sizing: border-box;
          padding: 8px 10px;
          background: var(--tt-post-stats-input-bg);
          color: var(--tt-post-stats-text);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 8px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }

        #hvPostStatsModal input[type="text"]:focus,
        #hvPostStatsModal input[type="date"]:focus {
          outline: none;
          border-color: var(--tt-post-stats-accent);
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal input[type="checkbox"] {
          accent-color: var(--tt-post-stats-success);
          transform: translateY(1px);
        }

        #hvPostStatsModal .hvPostStatsModal__checkboxLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--tt-post-stats-text);
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
          border: 1px solid var(--tt-post-stats-border);
          background: var(--tt-post-stats-card-alt);
          color: var(--tt-post-stats-heading);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        #hvPostStatsModal .hvPostStatsModal__close:hover {
          background: var(--tt-post-stats-input-bg);
        }

        #hvPostStatsModal .hvPostStatsModal__close:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--tt-post-stats-focus);
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
          background: var(--tt-post-stats-success);
          border: 1px solid var(--tt-post-stats-success);
          color: var(--tt-post-stats-card);
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
          color: var(--tt-post-stats-muted);
        }

        #hvPostStatsModal .hvPostStatsModal__progressBar {
          width: 100%;
          height: 10px;
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--tt-post-stats-card-alt);
        }

        #hvPostStatsModal #countPostsProgressFill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, var(--tt-post-stats-success) 0%, var(--tt-post-stats-accent) 100%);
          transition: width 0.15s ease;
        }

        #hvPostStatsModal .hvPostStatsModal__result {
          flex: 1 1 auto;
          min-height: 180px;
          max-height: calc(90vh - 300px);
          overflow-y: auto;
          margin-top: 2px;
          padding: 12px 14px;
          background: var(--tt-post-stats-card-alt);
          border: 1px solid var(--tt-post-stats-border);
          border-radius: 10px;
          line-height: 1.4;
        }

        #hvPostStatsModal .hvPostStatsModal__result a {
          color: var(--tt-post-stats-link);
        }

        #hvPostStatsModal .hvPostStatsModal__result hr {
          margin: 10px 0;
          border: none;
          height: 1px;
          background-color: var(--tt-post-stats-border);
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

    return hvPostStats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
