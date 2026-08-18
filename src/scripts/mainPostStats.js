(function (global) {
  'use strict';

  global.__TT_CREATE_POST_STATS__ = function createPostStats({ fetchForumApi, userID }) {
  const formatYmd = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const hvPostStats = {
    url: '',
    // selection
    userIds: [],
    forums: [],
    // picker catalogs (list/map/loaded)
    catalogs: {
      users: { list: [], map: {}, loaded: false },
      forums: { list: [], map: {}, loaded: false, categories: [] },
    },
    pickers: {
      users: null,
      forums: null,
    },
    // rendered output view; bbcodeText set only after renderResult
    view: {
      bbcodeText: '',
    },
    modal: null,
    inputs: {
      users: null,
      forums: null,
      from: null,
      to: null,
      countChars: null,
      bbcodeToggle: null,
      submit: null,
      close: null,
    },
    outputs: {
      result: null,
      resultWrap: null,
      resultChars: null,
      resultTopics: null,
      bbcode: null,
      bbcodeToggleWrap: null,
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
    cleanApiText: function (value) {
      return String(value || '').replace(/\u00ad/g, '').trim();
    },
    getUserLabelHtml: function (userId) {
      const { profileUrl, label } = this.getUserLabelParts(userId);
      return `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(label)}</a>`;
    },
    getUserLabelBbcode: function (userId) {
      const { profileUrl, label } = this.getUserLabelParts(userId);
      return `[url=${profileUrl}]${label}[/url]`;
    },
    getUserLabelParts: function (userId) {
      const profileUrl = `${this.url}/profile.php?id=${userId}`;
      const userName = this.catalogs.users.map[userId];
      return {
        profileUrl,
        label: userName || `ID ${userId}`,
      };
    },
    updateResultViewMode: function () {
      const hasResult = !!this.view.bbcodeText;
      const showBbcode = hasResult && !!this.inputs.bbcodeToggle?.checked;

      if (this.outputs.resultWrap) this.outputs.resultWrap.hidden = !hasResult || showBbcode;
      if (this.outputs.bbcode) {
        this.outputs.bbcode.hidden = !showBbcode;
        if (showBbcode) this.outputs.bbcode.value = this.view.bbcodeText;
      }
      if (this.outputs.bbcodeToggleWrap) this.outputs.bbcodeToggleWrap.hidden = !hasResult;
    },
    resolveUserMap: async function (userIds) {
      const ids = userIds.filter((id) => Number.isFinite(Number(id)) && Number(id) > 0);
      const uniqueIds = [ ...new Set(ids.map(id => Number(id))) ];
      const missingIds = uniqueIds.filter((id) => !this.catalogs.users.map[id]);
      if (!missingIds.length) return;

      await Promise.all(missingIds.map(async (id) => {
        try {
          const response = await fetchForumApi(`method=users.get&user_id=${id}`);
          const data = await response.json();
          const user = data?.response?.users?.[0];
          if (user?.username) this.catalogs.users.map[id] = user.username;
        } catch (error) {
          // Keep fallback label by ID if API fails for specific user.
        }
      }));
    },
    formatSelectionLabel: function (ids, getName) {
      if (!ids.length) return 'Не выбрано';
      const firstName = getName(ids[0]) || String(ids[0]);
      if (ids.length === 1) return firstName;
      return `${firstName} +${ids.length - 1}`;
    },
    updateSubmitState: function () {
      if (!this.inputs.submit) return;
      const hasForums = this.forums.length > 0;
      const hasUsers = this.userIds.length > 0;
      this.inputs.submit.disabled = !(hasForums && hasUsers);
    },
    syncSelection: function (kind) {
      const isUsers = kind === 'users';
      const input = isUsers ? this.inputs.users : this.inputs.forums;
      if (!input) return;
      const ids = isUsers ? this.userIds : this.forums;
      const map = isUsers ? this.catalogs.users.map : this.catalogs.forums.map;
      input.value = this.formatSelectionLabel(ids, (id) => map[id]);
    },
    syncSelections: function () {
      this.syncSelection('forums');
      this.syncSelection('users');
    },
    syncDateInputs: function () {
      const today = formatYmd(new Date());
      const lastTo = localStorage.getItem('hvCountPostsLastTo');
      const hasLastTo = /^\d{4}-\d{2}-\d{2}$/.test(lastTo || '');

      let fromValue = lastTo;
      if (!hasLastTo) {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        fromValue = formatYmd(monthAgo);
      }

      if (this.inputs.from) {
        this.inputs.from.value = fromValue;
        this.inputs.from.max = today;
      }
      if (this.inputs.to) {
        this.inputs.to.value = today;
        this.inputs.to.max = today;
      }
    },
    parseApiList: function (data, { listKeys = [], errorLabel }) {
      if (data?.error) {
        throw new Error(data.error.message || `${errorLabel} failed`);
      }
      const payload = data?.response;
      if (Array.isArray(payload)) return payload;
      for (let i = 0; i < listKeys.length; i++) {
        const list = payload?.[listKeys[i]];
        if (Array.isArray(list)) return list;
      }
      return [];
    },
    addCatalogEntry: function (catalog, entry) {
      if (!entry) return null;
      const cat = this.catalogs[catalog];
      const isNew = cat.map[entry.id] == null;
      cat.map[entry.id] = entry.name;
      if (isNew) cat.list.push(entry);
      return entry;
    },
    mapUserItem: function (user) {
      const id = Number(user?.user_id ?? user?.id);
      const name = user?.username;
      if (!Number.isFinite(id) || id <= 0 || !name) return null;
      return { id, name: String(name) };
    },
    mapForumItem: function (forum) {
      const id = Number(forum?.forum_id ?? forum?.id);
      const name = forum?.forum_name || forum?.name || forum?.title;
      const redirect = forum?.redirect_url || forum?.redirect;
      if (!Number.isFinite(id) || id <= 0 || !name || redirect) return null;
      const catId = Number(forum?.cat_id ?? forum?.category_id);
      return {
        id,
        name: this.cleanApiText(name),
        catId: Number.isFinite(catId) && catId > 0 ? catId : 0,
      };
    },
    mapCategoryItem: function (category, order) {
      const id = Number(category?.id ?? category?.cat_id);
      const name = category?.name || category?.cat_name || category?.title;
      if (!Number.isFinite(id) || id <= 0 || !name) return null;
      return { id, name: this.cleanApiText(name), order };
    },
    loadEntityList: async function ({ catalog, limit, fetchBatch, mapItem }) {
      const cat = this.catalogs[catalog];
      if (cat.loaded && cat.list.length) return cat.list;

      const { loadPagedEntities } = global.__TT_POST_STATS_PICKER__ || {};
      if (typeof loadPagedEntities !== 'function') throw new Error('post stats picker API missing');

      const { items, map } = await loadPagedEntities({
        limit,
        fetchBatch,
        mapItem,
      });

      cat.list = items;
      Object.assign(cat.map, map);
      cat.loaded = true;
      return items;
    },
    loadUserList: async function () {
      return this.loadEntityList({
        catalog: 'users',
        limit: 50,
        fetchBatch: async (limit, skip) => {
          const response = await fetchForumApi(
            `method=users.orderedList&fields=user_id,username&sort_by=username&sort_dir=asc&limit=${limit}&skip=${skip}`
          );
          return this.parseApiList(await response.json(), {
            listKeys: ['users'],
            errorLabel: 'users.orderedList',
          });
        },
        mapItem: (user) => this.mapUserItem(user),
      });
    },
    lookupUsersByQuery: async function (query) {
      const q = String(query || '').trim();
      if (!q) return [];

      // Soft-fail: search is optional enrichment; keep local filter if API flaky.
      const fetchUsers = async (params) => {
        try {
          const response = await fetchForumApi(`method=users.get&${params}&fields=user_id,username`);
          return this.parseApiList(await response.json(), {
            listKeys: ['users'],
            errorLabel: 'users.get',
          });
        } catch (error) {
          return [];
        }
      };

      const requests = [fetchUsers(`username=${encodeURIComponent(q)}`)];
      if (/^\d+$/.test(q)) requests.push(fetchUsers(`user_id=${q}`));

      const found = [];
      const batches = await Promise.all(requests);
      batches.flat().forEach((user) => {
        const entry = this.addCatalogEntry('users', this.mapUserItem(user));
        if (entry) found.push(entry);
      });
      return found;
    },
    loadForumList: async function () {
      const items = await this.loadEntityList({
        catalog: 'forums',
        limit: 100,
        fetchBatch: async (limit, skip) => {
          const response = await fetchForumApi(`method=board.getForums&limit=${limit}&skip=${skip}`);
          return this.parseApiList(await response.json(), {
            listKeys: ['forums'],
            errorLabel: 'board.getForums',
          });
        },
        mapItem: (forum) => this.mapForumItem(forum),
      });
      await this.attachForumCategories(items);
      return items;
    },
    loadCategoryList: async function () {
      const cat = this.catalogs.forums;
      if (cat.categoriesLoaded) return cat.categories || [];

      const { loadPagedEntities } = global.__TT_POST_STATS_PICKER__ || {};
      if (typeof loadPagedEntities !== 'function') return [];

      try {
        let order = 0;
        const { items } = await loadPagedEntities({
          limit: 100,
          fetchBatch: async (limit, skip) => {
            const response = await fetchForumApi(`method=board.getCategories&limit=${limit}&skip=${skip}`);
            return this.parseApiList(await response.json(), {
              listKeys: ['categories'],
              errorLabel: 'board.getCategories',
            });
          },
          mapItem: (category) => this.mapCategoryItem(category, order++),
        });
        cat.categories = items;
        cat.categoriesLoaded = true;
        return items;
      } catch (error) {
        cat.categories = cat.categories || [];
        cat.categoriesLoaded = false;
        return cat.categories;
      }
    },
    attachForumCategories: async function (forums) {
      const categories = await this.loadCategoryList();
      const orderById = new Map(categories.map((item, index) => [item.id, index]));
      const nameById = new Map(categories.map((item) => [item.id, item.name]));

      forums.forEach((forum, index) => {
        forum.catName = nameById.get(forum.catId) || (forum.catId ? `Категория ${forum.catId}` : '');
        forum.catOrder = orderById.has(forum.catId) ? orderById.get(forum.catId) : 10000;
        forum.sourceOrder = index;
      });

      forums.sort((a, b) => {
        if (a.catOrder !== b.catOrder) return a.catOrder - b.catOrder;
        return a.sourceOrder - b.sourceOrder;
      });
    },
    mountEntityPickers: function () {
      const api = global.__TT_POST_STATS_PICKER__;
      if (!api?.createEntityPicker || !api?.queryPickerEls) {
        throw new Error('post stats picker API missing');
      }
      const { createEntityPicker, queryPickerEls } = api;
      const root = (global.__TT_POST_STATS_MODAL_UI__?.getModalRoot || ((node) => node.shadowRoot || node))(this.modal);

      const specs = [
        {
          pickerKey: 'users',
          catalog: 'users',
          kindCap: 'Users',
          trigger: this.inputs.users,
          getSelectedIds: () => this.userIds,
          setSelectedIds: (ids) => {
            this.userIds = ids;
            this.syncSelection('users');
            this.updateSubmitState();
          },
          loadItems: () => this.loadUserList(),
          lookupByQuery: (q) => this.lookupUsersByQuery(q),
          texts: {
            empty: 'Пользователи не найдены',
            noMatch: 'Нет совпадений',
            loading: 'Загрузка пользователей…',
            loadError: 'Не удалось загрузить пользователей',
          },
        },
        {
          pickerKey: 'forums',
          catalog: 'forums',
          kindCap: 'Forums',
          trigger: this.inputs.forums,
          getSelectedIds: () => this.forums,
          setSelectedIds: (ids) => {
            this.forums = ids;
            this.syncSelection('forums');
            this.updateSubmitState();
          },
          loadItems: () => this.loadForumList(),
          groupBy: (item) => ({
            id: item.catId || 0,
            name: item.catName || '',
            order: item.catOrder,
          }),
          preserveOrder: true,
          texts: {
            empty: 'Форумы не найдены',
            noMatch: 'Нет совпадений',
            loading: 'Загрузка форумов…',
            loadError: 'Не удалось загрузить форумы',
          },
        },
      ];

      specs.forEach((spec) => {
        const cat = this.catalogs[spec.catalog];
        const ctrl = createEntityPicker({
          escapeHtml: (value) => this.escapeHtml(value),
          getItems: () => cat.list,
          getSelectedIds: spec.getSelectedIds,
          setSelectedIds: spec.setSelectedIds,
          loadItems: spec.loadItems,
          lookupByQuery: spec.lookupByQuery,
          groupBy: spec.groupBy,
          preserveOrder: spec.preserveOrder,
          onLoadError: () => { cat.loaded = false; },
          texts: spec.texts,
          els: queryPickerEls(spec.kindCap, spec.trigger, root),
        });
        ctrl.bind();
        this.pickers[spec.pickerKey] = ctrl;
      });
    },
    bindDomRefs: function (root) {
      const q = (sel) => root.querySelector(sel);
      const inputMap = {
        users: '#countPostsUsers',
        forums: '#countPostsForums',
        from: '#countPostsFrom',
        to: '#countPostsTo',
        countChars: '#countChars',
        bbcodeToggle: '#countPostsBbcodeToggle',
        submit: '#countPostsSubmit',
        close: '#hvPostStatsModalClose',
      };
      const outputMap = {
        result: '#countPostsStats',
        resultWrap: '#countPostsResultWrap',
        resultChars: '#countPostsCharsStats',
        resultTopics: '#countPostsTopicsStats',
        bbcode: '#countPostsBbcode',
        bbcodeToggleWrap: '#countPostsBbcodeToggleWrap',
        progressWrap: '#countPostsProgress',
        progressFill: '#countPostsProgressFill',
        progressText: '#countPostsProgressText',
      };

      Object.entries(inputMap).forEach(([key, sel]) => {
        this.inputs[key] = q(sel);
      });
      Object.entries(outputMap).forEach(([key, sel]) => {
        this.outputs[key] = q(sel);
      });
    },
    parsePositiveIds: function (values) {
      return (values || [])
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0);
    },
    restoreSelection: function () {
      const raw = localStorage.getItem('hvCountPosts');
      if (raw) {
        try {
          const { userIds, users, forums } = JSON.parse(raw);
          this.userIds = this.parsePositiveIds(userIds || users || []);
          this.forums = this.parsePositiveIds(forums || []);
        } catch (e) {
          // ignore bad storage
        }
      }

      if (userID && !this.userIds.includes(userID)) {
        this.userIds.push(userID);
      }
    },
    bindUiEvents: function () {
      this.inputs.close?.addEventListener('click', () => {
        this.pickers.users?.close();
        this.pickers.forums?.close();
        if (this.modal?.open && typeof this.modal.close === 'function') this.modal.close();
        else if (this.modal) this.modal.open = false;
      });
      this.inputs.bbcodeToggle?.addEventListener('change', () => this.updateResultViewMode());
      this.inputs.submit?.addEventListener('click', this.getStats.bind(this));
    },
    init: function () {
      if (this._inited) return;

      this.renderModal();
      this.bindDomRefs(global.__TT_POST_STATS_MODAL_UI__.getModalRoot(this.modal));
      this.restoreSelection();

      this.syncSelections();
      this.updateSubmitState();
      this.updateResultViewMode();
      this.resolveUserMap(this.userIds).then(() => {
        this.syncSelection('users');
        this.updateSubmitState();
      });

      this.mountEntityPickers();
      this.bindUiEvents();
      this.syncDateInputs();
      this._inited = true;
    },
    showDialog: function (modal) {
      if (!modal || modal.open) return;

      try {
        if (typeof modal.showModal === 'function') {
          modal.showModal();
          return;
        }
      } catch (e) {
        // Non-standard hosts may reject showModal; fall back below.
      }

      modal.setAttribute('open', '');
      modal.open = true;
    },
    openModal: function () {
      try {
        this.init();
      } catch (e) {
        this._inited = false;
        return;
      }

      if (!this.modal) return;

      this.syncDateInputs();
      this.showDialog(this.modal);

      this.loadForumList()
        .then(() => {
          this.syncSelection('forums');
          this.updateSubmitState();
        })
        .catch((error) => {
          this.catalogs.forums.loaded = false;
          console.warn('[tundra post-stats] forum list preload failed', error);
        });
    },
    renderModal: function () {
      const ui = global.__TT_POST_STATS_MODAL_UI__;
      if (!ui?.ensureModalStyles || !ui?.createModal) {
        throw new Error('post stats modal UI missing');
      }
      ui.ensureModalStyles();

      if (this.modal?.isConnected) return;

      const existing = document.querySelector('#hvPostStatsModal');
      const existingRoot = existing ? ui.getModalRoot(existing) : null;
      const hasShadow = !!(existingRoot && existingRoot !== existing);
      if (existing && !hasShadow) {
        existing.remove();
      } else if (existing) {
        this.modal = existing;
        ui.applyHostBox?.(existing);
        return;
      }

      this.modal = ui.createModal();
      document.body.appendChild(this.modal);
    },
    updateProgress: function (current, total, label) {
      if (!this.outputs.progressWrap || !this.outputs.progressFill || !this.outputs.progressText) return;
      const safeTotal = Math.max(total || 0, 1);
      const percent = Math.min(100, Math.max(0, Math.floor((current / safeTotal) * 100)));
      const text = `${label}: ${current}/${total || 0} (${percent}%)`;
      this.outputs.progressWrap.style.display = 'block';
      this.outputs.progressFill.style.width = `${percent}%`;
      this.outputs.progressText.textContent = text;
      const bar = this.outputs.progressWrap.querySelector('[role="progressbar"]');
      if (bar) {
        bar.setAttribute('aria-valuenow', String(percent));
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuetext', text);
      }
    },
    hideProgress: function () {
      if (!this.outputs.progressWrap || !this.outputs.progressFill || !this.outputs.progressText) return;
      this.outputs.progressWrap.style.display = 'none';
      this.outputs.progressFill.style.width = '0%';
      this.outputs.progressText.textContent = '';
      const bar = this.outputs.progressWrap.querySelector('[role="progressbar"]');
      if (bar) {
        bar.setAttribute('aria-valuenow', '0');
        bar.setAttribute('aria-valuetext', '');
      }
    },
    showResultMessage: function (message) {
      if (this.outputs.resultWrap) this.outputs.resultWrap.hidden = false;
      if (this.outputs.result) this.outputs.result.innerHTML = message;
    },
    STATS_ERROR_MESSAGE: 'Не удалось посчитать посты. Проверьте соединение и попробуйте снова.',
    getStats: async function (event) {
      this.forums = this.parsePositiveIds(this.forums);
      this.userIds = this.parsePositiveIds(this.userIds);

      if (!this.forums.length || !this.userIds.length) {
        this.updateSubmitState();
        return;
      }

      this.inputs.submit.disabled = true;
      this.view.bbcodeText = '';
      this.updateResultViewMode();
      this.outputs.result?.classList.add('loading');
      this.updateProgress(0, 1, 'Подготовка');

      this.url = window.location.origin;
      const countChars = this.inputs.countChars.checked;

      this.result = {
        total: 0,
        profiles: {},
        topics: {},
        errors: 0,
        posts: {},
      };
      if (this.outputs.result) this.outputs.result.innerHTML = '';
      if (this.outputs.resultChars) this.outputs.resultChars.innerHTML = '';
      if (this.outputs.resultTopics) this.outputs.resultTopics.innerHTML = '';
      if (this.outputs.bbcode) this.outputs.bbcode.value = '';

      const from = this.inputs.from.value;
      const to = this.inputs.to.value;
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);

      if (!from || !to) {
        this.updateSubmitState();
        this.outputs.result?.classList.remove('loading');
        this.hideProgress();
        return;
      }

      localStorage.setItem('hvCountPosts', JSON.stringify({
        forums: this.forums,
        userIds: this.userIds,
        from,
        to,
      }));

      try {
        const scrape = global.__TT_POST_STATS_SCRAPE__;
        if (typeof scrape !== 'function') throw new Error('post stats scrape API missing');

        const { result } = await scrape({
          baseUrl: this.url,
          forumIds: this.forums,
          userIds: this.userIds,
          startDate,
          endDate,
          countChars,
          onProgress: (current, total, label) => this.updateProgress(current, total, label),
          onRetry: (attemptsLeft) => {
            this.showResultMessage(
              `Не удалось загрузить страницу. Повторяю… Осталось попыток: ${attemptsLeft}`
            );
          },
        });
        this.result = result;
      } catch (error) {
        this.updateSubmitState();
        this.outputs.result?.classList.remove('loading');
        this.showResultMessage(this.STATS_ERROR_MESSAGE);
        this.hideProgress();
        return;
      }

      if (to) localStorage.setItem('hvCountPostsLastTo', to);

      this.updateSubmitState();
      this.outputs.result?.classList.remove('loading');
      this.hideProgress();
      this.renderResult();
    },
    renderResult: async function () {
      if (this.outputs.result) this.outputs.result.innerHTML = '';
      if (this.outputs.resultChars) this.outputs.resultChars.innerHTML = '';
      if (this.outputs.resultTopics) this.outputs.resultTopics.innerHTML = '';

      const fromLabel = new Date(this.inputs.from.value).toLocaleDateString('ru-RU');
      const toLabel = new Date(this.inputs.to.value).toLocaleDateString('ru-RU');
      await this.resolveUserMap(Object.keys(this.result.profiles).map(Number));

      const formatResult = global.__TT_POST_STATS_FORMAT_RESULT__;
      if (typeof formatResult !== 'function') throw new Error('post stats result formatter missing');

      const { charsHtml, topicsHtml, bbcodeText } = formatResult({
        result: this.result,
        fromLabel,
        toLabel,
        countChars: !!this.inputs.countChars?.checked,
        getUserLabelHtml: (userId) => this.getUserLabelHtml(userId),
        getUserLabelBbcode: (userId) => this.getUserLabelBbcode(userId),
        escapeHtml: (value) => this.escapeHtml(value),
      });

      if (this.outputs.resultChars) this.outputs.resultChars.innerHTML = charsHtml;
      if (this.outputs.resultTopics) this.outputs.resultTopics.innerHTML = topicsHtml;
      this.view.bbcodeText = bbcodeText;
      if (this.outputs.bbcode) this.outputs.bbcode.value = bbcodeText;
      this.updateResultViewMode();
    }
  };

    return hvPostStats;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
