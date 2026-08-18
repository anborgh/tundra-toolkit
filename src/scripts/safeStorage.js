var __TT_STORAGE_MODULE__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/utils/storage.ts
  var storage_exports = {};
  __export(storage_exports, {
    CLOUD_UPLOAD_NO_SPACE: () => CLOUD_UPLOAD_NO_SPACE,
    CLOUD_UPLOAD_RATE_LIMITED: () => CLOUD_UPLOAD_RATE_LIMITED,
    STORAGE_FALLBACKS_KEY: () => STORAGE_FALLBACKS_KEY,
    ensureMigrated: () => ensureMigrated,
    getCollectionLocations: () => getCollectionLocations,
    getItemLocation: () => getItemLocation,
    getStorageFallbacks: () => getStorageFallbacks,
    isChunkedStorageChange: () => isChunkedStorageChange,
    isStorageItemLocal: () => isStorageItemLocal,
    isStorageKeyLocal: () => isStorageKeyLocal,
    safeStorageGet: () => safeStorageGet,
    safeStoragePromoteFallbacks: () => safeStoragePromoteFallbacks,
    safeStorageSet: () => safeStorageSet,
    setItemCloudPinned: () => setItemCloudPinned
  });
  var FALLBACKS_KEY = "__tt_storage_fallbacks__";
  var CHUNK_TARGET_BYTES = 7500;
  var MIGRATION_KEY = "tt2/mig";
  var MIGRATION_VERSION = 2;
  var LOC_KEY = "tt2/loc";
  var SYNC_PRIORITY = [
    "favoriteTopics",
    "templates",
    "stickerPack",
    "ignoreList",
    "ignoredTopicsList"
  ];
  var COLLECTION_PREFIX = {
    templates: "tt2/t/",
    stickerPack: "tt2/s/",
    favoriteTopics: "tt2/f/",
    ignoreList: "tt2/iu/",
    ignoredTopicsList: "tt2/it/"
  };
  var INDEX_KEY = {
    templates: "tt2/idx/t",
    stickerPack: "tt2/idx/s",
    favoriteTopics: "tt2/idx/f",
    ignoreList: "tt2/idx/iu",
    ignoredTopicsList: "tt2/idx/it"
  };
  var LEGACY_ARRAY_KEYS = [
    "favoriteTopics",
    "templates",
    "stickerPack",
    "ignoreList",
    "ignoredTopicsList"
  ];
  var LEGACY_CHUNK_META = [
    "favoriteTopics__chunks",
    "templates__chunks",
    "stickerPack__chunks"
  ];
  var STORAGE_FALLBACKS_KEY = FALLBACKS_KEY;
  var isQuotaError = (error) => {
    if (!error) return false;
    const message = typeof error.message === "string" ? error.message : `${error}`;
    return /QUOTA_BYTES_PER_ITEM|QUOTA_BYTES|MAX_ITEMS|quota.*bytes/i.test(message);
  };
  var isWriteRateLimitError = (error) => {
    if (!error) return false;
    const message = typeof error.message === "string" ? error.message : `${error}`;
    return /MAX_WRITE_OPERATIONS/i.test(message);
  };
  var isSyncWriteBlockedError = (error) => isQuotaError(error) || isWriteRateLimitError(error);
  var syncWriteRateLimitedUntil = 0;
  var lastSyncWriteFail = null;
  var markSyncRateLimited = () => {
    syncWriteRateLimitedUntil = Date.now() + 6e4;
    lastSyncWriteFail = "rate";
  };
  var isSyncRateLimited = () => Date.now() < syncWriteRateLimitedUntil;
  var serializedBytes = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).length;
  var priorityIndex = (collection) => SYNC_PRIORITY.indexOf(collection);
  var getUpdatedAt = (entity) => entity && typeof entity.updatedAt === "number" ? entity.updatedAt : 0;
  var ensureUpdatedAt = (item) => {
    if (!item || typeof item !== "object") return item;
    if (typeof item.updatedAt === "number") return item;
    return { ...item, updatedAt: Date.now() };
  };
  var pickNewer = (a, b) => {
    const aAt = getUpdatedAt(a);
    const bAt = getUpdatedAt(b);
    if (aAt === bAt) return b ?? a;
    return aAt > bAt ? a : b;
  };
  var itemKey = (collection, id) => `${COLLECTION_PREFIX[collection]}${id}`;
  var chunkKey = (key, index) => `${key}#${index}`;
  var parseItemKey = (key) => {
    for (const collection of SYNC_PRIORITY) {
      const prefix = COLLECTION_PREFIX[collection];
      if (key.startsWith(prefix) && !key.includes("#")) {
        return { collection, id: key.slice(prefix.length) };
      }
    }
    return null;
  };
  var splitJsonPayload = (json, keyBase) => {
    if (!json.length) return [""];
    const chunks = [];
    let offset = 0;
    while (offset < json.length) {
      const key = `${keyBase}#${chunks.length}`;
      const budget = Math.max(1, CHUNK_TARGET_BYTES - key.length);
      let low = 1;
      let high = Math.min(json.length - offset, budget);
      let best = 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const slice = json.slice(offset, offset + mid);
        if (key.length + serializedBytes(slice) <= CHUNK_TARGET_BYTES) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      chunks.push(json.slice(offset, offset + best));
      offset += best;
    }
    return chunks;
  };
  var isChunkMeta = (value) => value && typeof value === "object" && value.__ttChunk === true && Number(value.count) >= 0;
  var readChunked = async (area, key, meta) => {
    const count = Number(meta.count) || 0;
    if (!count) return null;
    const keys = Array.from({ length: count }, (_, i) => chunkKey(key, i));
    const stored = await area.get(keys);
    const json = keys.map((k) => typeof stored[k] === "string" ? stored[k] : "").join("");
    try {
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  };
  var removeChunkKeys = async (area, key, previousCount = 64) => {
    const keys = [
      key,
      ...Array.from({ length: previousCount }, (_, i) => chunkKey(key, i))
    ];
    await area.remove(keys);
  };
  var writeAreaValue = async (area, key, value) => {
    const previous = await area.get(key);
    const prevMeta = previous?.[key];
    const prevCount = isChunkMeta(prevMeta) ? Number(prevMeta.count) || 0 : 0;
    const json = JSON.stringify(value);
    const fitsDirect = key.length + serializedBytes(value) <= CHUNK_TARGET_BYTES;
    if (fitsDirect) {
      await area.set({ [key]: value });
      if (prevCount) {
        await area.remove(Array.from({ length: prevCount }, (_, i) => chunkKey(key, i)));
      }
      return;
    }
    const chunks = splitJsonPayload(json, key);
    const meta = {
      __ttChunk: true,
      count: chunks.length,
      updatedAt: getUpdatedAt(value)
    };
    const payload = { [key]: meta };
    chunks.forEach((chunk, index) => {
      payload[chunkKey(key, index)] = chunk;
    });
    await area.set(payload);
    if (prevCount > chunks.length) {
      await area.remove(
        Array.from({ length: prevCount - chunks.length }, (_, i) => chunkKey(key, chunks.length + i))
      );
    }
  };
  var readAreaValue = async (area, key) => {
    const stored = await area.get(key);
    const value = stored?.[key];
    if (value === void 0) return void 0;
    if (isChunkMeta(value)) return readChunked(area, key, value);
    return value;
  };
  var writeQueue = Promise.resolve();
  var enqueueWrite = async (task) => {
    const run = writeQueue.then(task, task);
    writeQueue = run.then(() => void 0, () => void 0);
    return run;
  };
  var readLocations = async () => {
    const data = await chrome.storage.local.get(LOC_KEY);
    return data?.[LOC_KEY] && typeof data[LOC_KEY] === "object" ? data[LOC_KEY] : {};
  };
  var writeLocations = async (locations) => {
    await chrome.storage.local.set({ [LOC_KEY]: locations });
  };
  var readIndex = async (collection) => {
    const data = await chrome.storage.local.get(INDEX_KEY[collection]);
    const value = data?.[INDEX_KEY[collection]];
    return Array.isArray(value) ? value.map(String) : [];
  };
  var writeIndex = async (collection, ids) => {
    await chrome.storage.local.set({ [INDEX_KEY[collection]]: ids.map(String) });
  };
  var itemIdOf = (collection, item) => {
    if (collection === "ignoreList") {
      return `${item.boardID}:${item.forumID}`;
    }
    if (collection === "ignoredTopicsList") {
      return `${item.boardID}`;
    }
    return String(item.id);
  };
  var flattenIgnoreUsers = (boards = []) => {
    const items = [];
    boards.forEach((board) => {
      (board.forums || []).forEach((forum) => {
        const users = forum.users || [];
        const updatedAt = Math.max(
          0,
          ...users.map((u) => getUpdatedAt(u)),
          getUpdatedAt(board),
          getUpdatedAt(forum)
        ) || Date.now();
        items.push({
          boardID: board.boardID,
          boardName: board.boardName,
          boardUrl: board.boardUrl,
          forumID: forum.forumID,
          forumName: forum.forumName,
          users,
          updatedAt
        });
      });
    });
    return items;
  };
  var assembleIgnoreUsers = (items = []) => {
    const boards = /* @__PURE__ */ new Map();
    items.forEach((item) => {
      if (!boards.has(String(item.boardID))) {
        boards.set(String(item.boardID), {
          boardID: item.boardID,
          boardName: item.boardName,
          boardUrl: item.boardUrl,
          forums: []
        });
      }
      const board = boards.get(String(item.boardID));
      board.forums.push({
        forumID: item.forumID,
        forumName: item.forumName,
        users: item.users || []
      });
    });
    return [...boards.values()];
  };
  var normalizeIgnoredTopics = (boards = []) => boards.map((board) => ({
    ...board,
    updatedAt: Math.max(
      0,
      getUpdatedAt(board),
      ...(board.topics || []).map((t) => getUpdatedAt(t))
    ) || Date.now()
  }));
  var collectionFromLegacyKey = (key) => LEGACY_ARRAY_KEYS.includes(key) ? key : null;
  var listLocalItemKeys = async (collection) => {
    const all = await chrome.storage.local.get(null);
    const prefix = COLLECTION_PREFIX[collection];
    return Object.keys(all).filter((key) => key.startsWith(prefix) && !key.includes("#"));
  };
  var listSyncItemKeys = async (collection) => {
    const all = await chrome.storage.sync.get(null);
    const prefix = COLLECTION_PREFIX[collection];
    return Object.keys(all).filter((key) => key.startsWith(prefix) && !key.includes("#"));
  };
  var estimateSize = (value) => serializedBytes(value);
  var demoteCandidates = async (locations, demoteBelowPriority = -1) => {
    const candidates = [];
    for (const collection of [...SYNC_PRIORITY].reverse()) {
      if (priorityIndex(collection) <= demoteBelowPriority) continue;
      for (const key of await listSyncItemKeys(collection)) {
        const loc = locations[key];
        if (loc === "localPinned") continue;
        const value = await readAreaValue(chrome.storage.sync, key);
        if (value === void 0 || value === null) continue;
        const parsed = parseItemKey(key);
        if (!parsed) continue;
        candidates.push({
          collection,
          id: parsed.id,
          key,
          size: estimateSize(value),
          updatedAt: getUpdatedAt(value)
        });
      }
    }
    candidates.sort((a, b) => {
      const p = priorityIndex(b.collection) - priorityIndex(a.collection);
      if (p) return p;
      if (b.size !== a.size) return b.size - a.size;
      return a.updatedAt - b.updatedAt;
    });
    return candidates;
  };
  var removeFromSync = async (key) => {
    if (isSyncRateLimited()) return;
    try {
      const meta = await chrome.storage.sync.get(key);
      const count = isChunkMeta(meta?.[key]) ? Number(meta[key].count) || 0 : 0;
      await removeChunkKeys(chrome.storage.sync, key, Math.max(count, 16));
    } catch (error) {
      if (isWriteRateLimitError(error)) {
        markSyncRateLimited();
        return;
      }
      throw error;
    }
  };
  var tryWriteToSync = async (key, value) => {
    lastSyncWriteFail = null;
    if (isSyncRateLimited()) {
      lastSyncWriteFail = "rate";
      return false;
    }
    try {
      await writeAreaValue(chrome.storage.sync, key, value);
      return true;
    } catch (error) {
      if (isWriteRateLimitError(error)) {
        markSyncRateLimited();
        return false;
      }
      if (isQuotaError(error)) {
        lastSyncWriteFail = "quota";
        return false;
      }
      throw error;
    }
  };
  var syncItem = async (collection, id, value, locations, options = {}) => {
    const key = itemKey(collection, id);
    const allowDemote = options.allowDemote !== false;
    if (locations[key] === "localPinned") {
      await removeFromSync(key);
      return "localPinned";
    }
    if (await tryWriteToSync(key, value)) {
      locations[key] = "sync";
      return "sync";
    }
    if (lastSyncWriteFail === "rate" || isSyncRateLimited()) {
      locations[key] = "local";
      return "local";
    }
    if (allowDemote) {
      for (const candidate of await demoteCandidates(locations, priorityIndex(collection))) {
        if (candidate.key === key) continue;
        if (isSyncRateLimited()) break;
        await removeFromSync(candidate.key);
        locations[candidate.key] = locations[candidate.key] === "localPinned" ? "localPinned" : "local";
        await writeLocations(locations);
        if (await tryWriteToSync(key, value)) {
          locations[key] = "sync";
          return "sync";
        }
        if (lastSyncWriteFail === "rate" || isSyncRateLimited()) {
          locations[key] = "local";
          return "local";
        }
      }
    }
    await removeFromSync(key);
    locations[key] = "local";
    return "local";
  };
  var promoteLocalItems = async (locations) => {
    if (isSyncRateLimited()) return;
    for (const collection of SYNC_PRIORITY) {
      const ids = await readIndex(collection);
      const pending = [];
      for (const id of ids) {
        const key = itemKey(collection, id);
        if (locations[key] !== "local") continue;
        const value = await readLocalItem(key);
        if (value == null) continue;
        pending.push({ id, key, value, size: estimateSize(value) });
      }
      pending.sort((a, b) => a.size - b.size || a.id.localeCompare(b.id));
      for (const item of pending) {
        if (isSyncRateLimited()) return;
        const loc = await syncItem(collection, item.id, item.value, locations, { allowDemote: false });
        locations[item.key] = loc;
        if (loc === "local" && (lastSyncWriteFail === "rate" || isSyncRateLimited())) {
          return;
        }
      }
    }
  };
  var writeLocalItem = async (key, value) => {
    await writeAreaValue(chrome.storage.local, key, value);
  };
  var readLocalItem = async (key) => readAreaValue(chrome.storage.local, key);
  var readSyncItem = async (key) => readAreaValue(chrome.storage.sync, key);
  var upsertCollectionItem = async (collection, item, locations) => {
    const prepared = ensureUpdatedAt(item);
    const id = itemIdOf(collection, prepared);
    const key = itemKey(collection, id);
    await writeLocalItem(key, prepared);
    const location = await syncItem(collection, id, prepared, locations);
    locations[key] = location;
    return { id, key, location, item: prepared };
  };
  var removeCollectionItem = async (collection, id, locations) => {
    const key = itemKey(collection, id);
    const localMeta = await chrome.storage.local.get(key);
    const count = isChunkMeta(localMeta?.[key]) ? Number(localMeta[key].count) || 0 : 0;
    await removeChunkKeys(chrome.storage.local, key, Math.max(count, 16));
    await removeFromSync(key);
    delete locations[key];
  };
  var loadCollectionItems = async (collection) => {
    const locations = await readLocations();
    let ids = await readIndex(collection);
    const localKeys = await listLocalItemKeys(collection);
    const syncKeys = await listSyncItemKeys(collection);
    const allIds = /* @__PURE__ */ new Set([
      ...ids,
      ...localKeys.map((key) => parseItemKey(key)?.id).filter(Boolean),
      ...syncKeys.map((key) => parseItemKey(key)?.id).filter(Boolean)
    ]);
    const items = [];
    const nextIds = [];
    let locationsChanged = false;
    for (const id of allIds) {
      const key = itemKey(collection, id);
      const localValue = await readLocalItem(key);
      const syncValue = await readSyncItem(key);
      let value;
      if (localValue != null && syncValue != null) {
        value = pickNewer(localValue, syncValue);
        if (JSON.stringify(value) !== JSON.stringify(localValue)) {
          await writeLocalItem(key, value);
        }
        if (locations[key] !== "localPinned" && JSON.stringify(value) !== JSON.stringify(syncValue) && getUpdatedAt(value) > getUpdatedAt(syncValue)) {
          const loc = await syncItem(collection, id, value, locations, { allowDemote: false });
          locations[key] = loc;
          locationsChanged = true;
        }
      } else if (localValue != null) {
        value = localValue;
        if (!locations[key]) {
          locations[key] = "local";
          locationsChanged = true;
        }
      } else if (syncValue != null) {
        value = syncValue;
        await writeLocalItem(key, value);
        locations[key] = "sync";
        locationsChanged = true;
      } else {
        continue;
      }
      items.push(value);
      nextIds.push(id);
    }
    const ordered = [
      ...ids.filter((id) => nextIds.includes(id)),
      ...nextIds.filter((id) => !ids.includes(id))
    ];
    if (JSON.stringify(ordered) !== JSON.stringify(ids)) {
      await writeIndex(collection, ordered);
    } else if (!ids.length && ordered.length) {
      await writeIndex(collection, ordered);
    }
    if (locationsChanged) await writeLocations(locations);
    const byId = new Map(items.map((item) => [itemIdOf(collection, item), item]));
    return ordered.map((id) => byId.get(id)).filter(Boolean);
  };
  var replaceCollection = async (collection, list) => {
    return enqueueWrite(async () => {
      await ensureMigrated();
      const locations = await readLocations();
      const previousIds = await readIndex(collection);
      const nextItems = collection === "ignoreList" ? flattenIgnoreUsers(list) : collection === "ignoredTopicsList" ? normalizeIgnoredTopics(list) : (Array.isArray(list) ? list : []).map(ensureUpdatedAt);
      const nextIds = nextItems.map((item) => itemIdOf(collection, item));
      const nextIdSet = new Set(nextIds);
      for (const id of previousIds) {
        if (!nextIdSet.has(id)) {
          await removeCollectionItem(collection, id, locations);
        }
      }
      for (const key of await listLocalItemKeys(collection)) {
        const parsed = parseItemKey(key);
        if (parsed && !nextIdSet.has(parsed.id)) {
          await removeCollectionItem(collection, parsed.id, locations);
        }
      }
      for (const item of nextItems) {
        await upsertCollectionItem(collection, item, locations);
      }
      await writeIndex(collection, nextIds);
      await promoteLocalItems(locations);
      await writeLocations(locations);
      const worst = nextIds.some((id) => {
        const loc = locations[itemKey(collection, id)];
        return loc === "local" || loc === "localPinned";
      });
      return {
        location: worst ? "local" : "sync",
        fallback: worst
      };
    });
  };
  var readCollectionFacade = async (collection) => {
    await ensureMigrated();
    const items = await loadCollectionItems(collection);
    if (collection === "ignoreList") return assembleIgnoreUsers(items);
    return items;
  };
  var readLegacyChunked = async (key, areaData, area) => {
    const meta = areaData?.[`${key}__chunks`];
    const count = Number(meta?.count) || 0;
    if (!(meta && count >= 0)) {
      return Array.isArray(areaData?.[key]) ? areaData[key] : null;
    }
    if (!count) return [];
    const store = area === "sync" ? chrome.storage.sync : chrome.storage.local;
    const keys = Array.from({ length: count }, (_, i) => `${key}__chunk_${i}`);
    const stored = await store.get(keys);
    if (meta.encoding === "json" || meta.version === 2) {
      const json = keys.map((k) => typeof stored[k] === "string" ? stored[k] : "").join("");
      try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return keys.flatMap((k) => Array.isArray(stored[k]) ? stored[k] : []);
  };
  var mergeLegacyLists = (localList, syncList, getId) => {
    const map = /* @__PURE__ */ new Map();
    [...syncList, ...localList].forEach((item) => {
      if (!item) return;
      const id = getId(item);
      const prev = map.get(id);
      map.set(id, prev ? pickNewer(prev, item) : item);
    });
    const syncMap = new Map(syncList.map((item) => [getId(item), item]));
    const localMap = new Map(localList.map((item) => [getId(item), item]));
    const ids = /* @__PURE__ */ new Set([...syncMap.keys(), ...localMap.keys()]);
    const result = [];
    ids.forEach((id) => {
      const local = localMap.get(id);
      const sync = syncMap.get(id);
      if (local && sync) result.push(pickNewer(local, sync));
      else result.push(local ?? sync);
    });
    return result;
  };
  var migrationPromise = null;
  var runMigration = async () => {
    const state = await chrome.storage.local.get(MIGRATION_KEY);
    if (state?.[MIGRATION_KEY] === MIGRATION_VERSION) return;
    const syncAll = await chrome.storage.sync.get(null);
    const localAll = await chrome.storage.local.get(null);
    const locations = {};
    for (const collection of ["favoriteTopics", "templates", "stickerPack"]) {
      const syncList = await readLegacyChunked(collection, syncAll, "sync") || [];
      const localList = await readLegacyChunked(collection, localAll, "local") || (Array.isArray(localAll[collection]) ? localAll[collection] : []);
      const merged = mergeLegacyLists(
        Array.isArray(localList) ? localList : [],
        Array.isArray(syncList) ? syncList : [],
        (item) => String(item.id)
      );
      const ids = [];
      for (const item of merged) {
        const prepared = ensureUpdatedAt(item);
        const id = String(prepared.id);
        const key = itemKey(collection, id);
        await writeLocalItem(key, prepared);
        ids.push(id);
        const loc = await syncItem(collection, id, prepared, locations);
        locations[key] = loc;
      }
      await writeIndex(collection, ids);
    }
    {
      const syncList = Array.isArray(syncAll.ignoreList) ? syncAll.ignoreList : [];
      const localList = Array.isArray(localAll.ignoreList) ? localAll.ignoreList : [];
      const syncFlat = flattenIgnoreUsers(syncList);
      const localFlat = flattenIgnoreUsers(localList);
      const merged = mergeLegacyLists(localFlat, syncFlat, (item) => `${item.boardID}:${item.forumID}`);
      const ids = [];
      for (const item of merged) {
        const prepared = ensureUpdatedAt(item);
        const id = itemIdOf("ignoreList", prepared);
        const key = itemKey("ignoreList", id);
        await writeLocalItem(key, prepared);
        ids.push(id);
        locations[key] = await syncItem("ignoreList", id, prepared, locations);
      }
      await writeIndex("ignoreList", ids);
    }
    {
      const syncList = normalizeIgnoredTopics(Array.isArray(syncAll.ignoredTopicsList) ? syncAll.ignoredTopicsList : []);
      const localList = normalizeIgnoredTopics(Array.isArray(localAll.ignoredTopicsList) ? localAll.ignoredTopicsList : []);
      const merged = mergeLegacyLists(localList, syncList, (item) => String(item.boardID));
      const ids = [];
      for (const item of merged) {
        const prepared = ensureUpdatedAt(item);
        const id = itemIdOf("ignoredTopicsList", prepared);
        const key = itemKey("ignoredTopicsList", id);
        await writeLocalItem(key, prepared);
        ids.push(id);
        locations[key] = await syncItem("ignoredTopicsList", id, prepared, locations);
      }
      await writeIndex("ignoredTopicsList", ids);
    }
    await writeLocations(locations);
    const legacyRemoveSync = [
      "ignoreList",
      "ignoredTopicsList",
      "stickerPack",
      "templates",
      "favoriteTopics",
      FALLBACKS_KEY,
      "migrationPending",
      "migrationConflicts",
      "migrationDone",
      ...LEGACY_CHUNK_META
    ];
    for (const key of Object.keys(syncAll)) {
      if (/__(chunk_|chunks)/.test(key) || key.includes("__chunk_")) {
        legacyRemoveSync.push(key);
      }
    }
    try {
      await chrome.storage.sync.remove([...new Set(legacyRemoveSync)]);
    } catch (error) {
      if (!isSyncWriteBlockedError(error)) throw error;
      if (isWriteRateLimitError(error)) markSyncRateLimited();
    }
    const legacyRemoveLocal = [
      "ignoreList",
      "ignoredTopicsList",
      "stickerPack",
      "templates",
      "favoriteTopics",
      FALLBACKS_KEY,
      "migrationPending",
      "migrationConflicts",
      "migrationDone",
      ...LEGACY_CHUNK_META
    ];
    for (const key of Object.keys(localAll)) {
      if (/__(chunk_|chunks)/.test(key) || key.includes("__chunk_")) {
        legacyRemoveLocal.push(key);
      }
    }
    await chrome.storage.local.remove([...new Set(legacyRemoveLocal)]);
    await chrome.storage.local.set({ [MIGRATION_KEY]: MIGRATION_VERSION });
  };
  var ensureMigrated = async () => {
    if (!migrationPromise) {
      migrationPromise = runMigration().catch((error) => {
        migrationPromise = null;
        throw error;
      });
    }
    await migrationPromise;
  };
  var safeStorageGet = async (keys) => {
    await ensureMigrated();
    const result = {};
    for (const key of keys) {
      const collection = collectionFromLegacyKey(key);
      if (collection) {
        result[key] = await readCollectionFacade(collection);
      } else {
        const [syncData, localData] = await Promise.all([
          chrome.storage.sync.get(key),
          chrome.storage.local.get(key)
        ]);
        result[key] = syncData?.[key] ?? localData?.[key];
      }
    }
    return result;
  };
  var safeStorageSet = async (data) => {
    await ensureMigrated();
    let worst = "sync";
    const regular = { ...data };
    for (const collection of LEGACY_ARRAY_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(regular, collection)) continue;
      const list = regular[collection];
      delete regular[collection];
      const result = await replaceCollection(collection, list);
      if (result.fallback) worst = "local";
    }
    for (const key of Object.keys(regular)) {
      try {
        if (isSyncRateLimited()) throw new Error("MAX_WRITE_OPERATIONS_PER_MINUTE");
        await chrome.storage.sync.set({ [key]: regular[key] });
        await chrome.storage.local.remove(key);
      } catch (error) {
        if (!isSyncWriteBlockedError(error)) throw error;
        if (isWriteRateLimitError(error)) markSyncRateLimited();
        await chrome.storage.local.set({ [key]: regular[key] });
        worst = "local";
      }
    }
    return { location: worst, fallback: worst !== "sync" };
  };
  var getItemLocation = async (collection, id) => {
    await ensureMigrated();
    const locations = await readLocations();
    return locations[itemKey(collection, id)] || "local";
  };
  var getCollectionLocations = async (collection) => {
    await ensureMigrated();
    const locations = await readLocations();
    const prefix = COLLECTION_PREFIX[collection];
    const result = {};
    Object.entries(locations).forEach(([key, loc]) => {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = loc;
      }
    });
    return result;
  };
  var CLOUD_UPLOAD_NO_SPACE = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0432 Chrome Sync \u2014 \u0441\u043D\u0430\u0447\u0430\u043B\u0430 \u043E\u0441\u0432\u043E\u0431\u043E\u0434\u0438\u0442\u0435 \u043C\u0435\u0441\u0442\u043E.";
  var CLOUD_UPLOAD_RATE_LIMITED = "\u0421\u043B\u0438\u0448\u043A\u043E\u043C \u043C\u043D\u043E\u0433\u043E \u0437\u0430\u043F\u0438\u0441\u0435\u0439 \u0432 Chrome Sync. \u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435 \u043E\u043A\u043E\u043B\u043E \u043C\u0438\u043D\u0443\u0442\u044B \u0438 \u043F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0441\u043D\u043E\u0432\u0430.";
  var setItemCloudPinned = async (collection, id, pinnedLocal) => {
    return enqueueWrite(async () => {
      await ensureMigrated();
      const locations = await readLocations();
      const key = itemKey(collection, String(id));
      const value = await readLocalItem(key);
      if (value == null) {
        return { location: locations[key] || "local" };
      }
      if (pinnedLocal) {
        await removeFromSync(key);
        locations[key] = "localPinned";
        await writeLocations(locations);
        return { location: "localPinned" };
      }
      locations[key] = "local";
      const loc = await syncItem(collection, String(id), value, locations, { allowDemote: false });
      if (loc !== "sync") {
        locations[key] = "localPinned";
        await writeLocations(locations);
        const error = lastSyncWriteFail === "rate" || isSyncRateLimited() ? CLOUD_UPLOAD_RATE_LIMITED : CLOUD_UPLOAD_NO_SPACE;
        return { location: "localPinned", error };
      }
      locations[key] = "sync";
      await promoteLocalItems(locations);
      await writeLocations(locations);
      return { location: "sync" };
    });
  };
  var getStorageFallbacks = async () => {
    await ensureMigrated();
    const locations = await readLocations();
    const fallbacks = {};
    for (const collection of LEGACY_ARRAY_KEYS) {
      const prefix = COLLECTION_PREFIX[collection];
      const localIds = [];
      let allLocal = true;
      let any = false;
      Object.entries(locations).forEach(([key, loc]) => {
        if (!key.startsWith(prefix)) return;
        any = true;
        if (loc === "sync") allLocal = false;
        else localIds.push(key.slice(prefix.length));
      });
      if (!any) continue;
      if (allLocal && localIds.length) fallbacks[collection] = "local";
      else if (localIds.length) fallbacks[collection] = { localIds };
    }
    return fallbacks;
  };
  var isStorageKeyLocal = (fallbacks, key) => {
    const entry = fallbacks[key];
    return entry === "local" || typeof entry === "object" && Array.isArray(entry.localIds) && entry.localIds.length > 0;
  };
  var isStorageItemLocal = (fallbacks, key, id) => {
    const entry = fallbacks[key];
    if (!entry) return false;
    if (entry === "local") return true;
    return entry.localIds.some((localId) => String(localId) === String(id));
  };
  var isChunkedStorageChange = (changes, key) => {
    const collection = collectionFromLegacyKey(key);
    if (!collection) return Boolean(changes[key]);
    const prefix = COLLECTION_PREFIX[collection];
    if (changes[INDEX_KEY[collection]] || changes[LOC_KEY]) return true;
    return Object.keys(changes).some((changeKey) => changeKey.startsWith(prefix));
  };
  var safeStoragePromoteFallbacks = async () => {
    await ensureMigrated();
    await enqueueWrite(async () => {
      const locations = await readLocations();
      await promoteLocalItems(locations);
      await writeLocations(locations);
    });
  };
  return __toCommonJS(storage_exports);
})();

globalThis.__TT_SAFE_STORAGE__ = {
  STORAGE_FALLBACKS_KEY: __TT_STORAGE_MODULE__.STORAGE_FALLBACKS_KEY,
  getStorageFallbacks: __TT_STORAGE_MODULE__.getStorageFallbacks,
  isStorageKeyLocal: __TT_STORAGE_MODULE__.isStorageKeyLocal,
  isStorageItemLocal: __TT_STORAGE_MODULE__.isStorageItemLocal,
  isChunkedStorageChange: __TT_STORAGE_MODULE__.isChunkedStorageChange,
  safeStorageSet: __TT_STORAGE_MODULE__.safeStorageSet,
  safeStorageGet: __TT_STORAGE_MODULE__.safeStorageGet,
  safeStoragePromoteFallbacks: __TT_STORAGE_MODULE__.safeStoragePromoteFallbacks,
  ensureMigrated: __TT_STORAGE_MODULE__.ensureMigrated,
  getItemLocation: __TT_STORAGE_MODULE__.getItemLocation,
  getCollectionLocations: __TT_STORAGE_MODULE__.getCollectionLocations,
  setItemCloudPinned: __TT_STORAGE_MODULE__.setItemCloudPinned,
};

