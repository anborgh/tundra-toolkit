(function (global) {
  'use strict';

  const loadPagedEntities = async ({ limit, fetchBatch, mapItem, safetyMaxPages = 200 }) => {
    const items = [];
    const map = {};
    const seen = new Set();
    let skip = 0;
    let page = 0;

    while (true) {
      if (page >= safetyMaxPages) {
        throw new Error(`entity list pagination hit safety limit (${safetyMaxPages} pages)`);
      }

      const batch = await fetchBatch(limit, skip);
      if (!batch.length) break;

      batch.forEach((raw) => {
        const item = mapItem(raw);
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
        map[item.id] = item.name;
      });

      page += 1;
      if (batch.length < limit) break;
      skip += limit;
    }

    return { items, map };
  };

  const queryPickerEls = (kindCap, trigger) => ({
    trigger,
    search: document.querySelector(`#countPosts${kindCap}Search`),
    list: document.querySelector(`#countPosts${kindCap}List`),
    picker: document.querySelector(`#hvPostStats${kindCap}Picker`),
    apply: document.querySelector(`#countPosts${kindCap}Apply`),
    cancel: document.querySelector(`#countPosts${kindCap}Cancel`),
    close: document.querySelector(`#hvPostStats${kindCap}PickerClose`),
  });

  /**
   * Multi-select entity picker (users / forums / etc).
   * Owns draft/pinned/search UI state; parent owns selected ids + item lists.
   */
  const createEntityPicker = ({
    escapeHtml,
    getItems,
    getSelectedIds,
    setSelectedIds,
    loadItems,
    lookupByQuery,
    getLabel = (item) => item.name,
    onLoadError,
    texts,
    els,
  }) => {
    let draft = new Set();
    let pinned = new Set();
    let searchToken = 0;
    let searchTimer = null;

    const sortPinnedFirst = (items, pinnedSet) => items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const aPin = pinnedSet.has(a.item.id) ? 0 : 1;
        const bPin = pinnedSet.has(b.item.id) ? 0 : 1;
        if (aPin !== bPin) return aPin - bPin;
        return a.index - b.index;
      })
      .map(({ item }) => item);

    const setListHtml = (html) => {
      if (els.list) els.list.innerHTML = html;
    };

    const renderList = (query = '') => {
      if (!els.list) return;

      const items = getItems() || [];
      const q = String(query || '').trim().toLowerCase();
      const filtered = !q
        ? items
        : items.filter((item) => {
          const idMatch = String(item.id).includes(q);
          const nameMatch = String(getLabel(item) || '').toLowerCase().includes(q);
          return idMatch || nameMatch;
        });
      const ordered = sortPinnedFirst(filtered, pinned);

      if (!items.length) {
        setListHtml(`<div class="hvPostStatsModal__pickerEmpty">${texts.empty}</div>`);
        return;
      }

      if (!ordered.length) {
        setListHtml(`<div class="hvPostStatsModal__pickerEmpty">${texts.noMatch}</div>`);
        return;
      }

      els.list.innerHTML = ordered.map((item) => {
        const checked = draft.has(item.id) ? ' checked' : '';
        const label = escapeHtml(getLabel(item) || String(item.id));
        return `
          <label class="hvPostStatsModal__pickerItem">
            <input type="checkbox" value="${item.id}"${checked} />
            <span class="hvPostStatsModal__pickerName">${label}</span>
            <span class="hvPostStatsModal__pickerId">#${item.id}</span>
          </label>
        `;
      }).join('');
    };

    const handleSearchInput = () => {
      const query = els.search?.value || '';
      renderList(query);

      if (typeof lookupByQuery !== 'function') return;

      searchToken += 1;
      const currentToken = searchToken;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = String(els.search?.value || '').trim();
        if (!q) return;
        try {
          await lookupByQuery(q);
          if (currentToken !== searchToken) return;
          renderList(els.search?.value || '');
        } catch (error) {
          // keep current filtered list
        }
      }, 250);
    };

    const close = () => {
      if (!els.picker) return;
      els.picker.hidden = true;
      document.removeEventListener('keydown', onDocKeyDown, true);
    };

    const onDocKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      if (!els.picker || els.picker.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };

    const open = async () => {
      if (!els.picker) return;

      const selected = (getSelectedIds() || []).map(Number);
      pinned = new Set(selected);
      draft = new Set(selected);
      els.picker.hidden = false;
      document.removeEventListener('keydown', onDocKeyDown, true);
      document.addEventListener('keydown', onDocKeyDown, true);
      if (els.search) els.search.value = '';
      setListHtml(`<div class="hvPostStatsModal__pickerEmpty">${texts.loading}</div>`);

      try {
        await loadItems();
        renderList('');
        const isCoarsePointer = typeof window.matchMedia === 'function'
          && window.matchMedia('(pointer: coarse)').matches;
        if (!isCoarsePointer) els.search?.focus();
      } catch (error) {
        if (typeof onLoadError === 'function') onLoadError(error);
        setListHtml(`<div class="hvPostStatsModal__pickerEmpty">${texts.loadError}</div>`);
      }
    };

    const apply = () => {
      const ids = Array.from(draft)
        .map(Number)
        .filter((id) => Number.isFinite(id) && id > 0)
        .sort((a, b) => a - b);
      setSelectedIds(ids);
      close();
    };

    const bind = () => {
      els.trigger?.addEventListener('click', (e) => {
        e.preventDefault();
        open();
      });
      els.trigger?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
      els.search?.addEventListener('input', () => handleSearchInput());
      els.list?.addEventListener('change', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
        const id = Number(target.value);
        if (!Number.isFinite(id) || id <= 0) return;
        if (target.checked) draft.add(id);
        else draft.delete(id);
      });
      els.apply?.addEventListener('click', () => apply());
      els.cancel?.addEventListener('click', () => close());
      els.close?.addEventListener('click', () => close());
    };

    return { open, close, apply, bind, renderList };
  };

  global.__TT_POST_STATS_PICKER__ = {
    createEntityPicker,
    loadPagedEntities,
    queryPickerEls,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
