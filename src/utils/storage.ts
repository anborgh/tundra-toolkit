const FALLBACKS_KEY = '__tt_storage_fallbacks__'; // legacy, cleared on migration
const CHUNK_TARGET_BYTES = 7500;
const MIGRATION_KEY = 'tt2/mig';
const MIGRATION_VERSION = 2;
const LOC_KEY = 'tt2/loc';

export type ItemLocation = 'sync' | 'local' | 'localPinned';
export type StorageFallbackEntry = 'local' | { localIds: Array<number | string> };
export type StorageFallbackMap = Record<string, StorageFallbackEntry>;

export type CollectionId =
  | 'templates'
  | 'stickerPack'
  | 'favoriteTopics'
  | 'ignoreList'
  | 'ignoredTopicsList';

/** Higher index = lower sync priority (demoted first). */
const SYNC_PRIORITY: CollectionId[] = [
  'favoriteTopics',
  'templates',
  'stickerPack',
  'ignoreList',
  'ignoredTopicsList',
];

const COLLECTION_PREFIX: Record<CollectionId, string> = {
  templates: 'tt2/t/',
  stickerPack: 'tt2/s/',
  favoriteTopics: 'tt2/f/',
  ignoreList: 'tt2/iu/',
  ignoredTopicsList: 'tt2/it/',
};

const INDEX_KEY: Record<CollectionId, string> = {
  templates: 'tt2/idx/t',
  stickerPack: 'tt2/idx/s',
  favoriteTopics: 'tt2/idx/f',
  ignoreList: 'tt2/idx/iu',
  ignoredTopicsList: 'tt2/idx/it',
};

const LEGACY_ARRAY_KEYS: CollectionId[] = [
  'favoriteTopics',
  'templates',
  'stickerPack',
  'ignoreList',
  'ignoredTopicsList',
];

const LEGACY_CHUNK_META = [
  'favoriteTopics__chunks',
  'templates__chunks',
  'stickerPack__chunks',
] as const;

export const STORAGE_FALLBACKS_KEY = FALLBACKS_KEY;

const isQuotaError = (error: any) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${ error }`;
  return /QUOTA_BYTES_PER_ITEM|QUOTA_BYTES|MAX_ITEMS|quota.*bytes/i.test(message);
};

/** chrome.storage.sync rate limits (120/min, 1800/hour). */
const isWriteRateLimitError = (error: any) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${ error }`;
  return /MAX_WRITE_OPERATIONS/i.test(message);
};

const isSyncWriteBlockedError = (error: any) =>
  isQuotaError(error) || isWriteRateLimitError(error);

/** Skip further sync writes until this timestamp after a rate-limit hit. */
let syncWriteRateLimitedUntil = 0;
type SyncWriteFailReason = 'quota' | 'rate' | null;
let lastSyncWriteFail: SyncWriteFailReason = null;

const markSyncRateLimited = () => {
  syncWriteRateLimitedUntil = Date.now() + 60_000;
  lastSyncWriteFail = 'rate';
};

const isSyncRateLimited = () => Date.now() < syncWriteRateLimitedUntil;

const serializedBytes = (value: any) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;

const priorityIndex = (collection: CollectionId) => SYNC_PRIORITY.indexOf(collection);

const getUpdatedAt = (entity: any) =>
  entity && typeof entity.updatedAt === 'number' ? entity.updatedAt : 0;

const ensureUpdatedAt = (item: any) => {
  if (!item || typeof item !== 'object') return item;
  if (typeof item.updatedAt === 'number') return item;
  return { ...item, updatedAt: Date.now() };
};

const pickNewer = (a: any, b: any) => {
  const aAt = getUpdatedAt(a);
  const bAt = getUpdatedAt(b);
  if (aAt === bAt) return b ?? a; // tie → sync (b) when both exist
  return aAt > bAt ? a : b;
};

const itemKey = (collection: CollectionId, id: string | number) =>
  `${ COLLECTION_PREFIX[collection] }${ id }`;

const chunkKey = (key: string, index: number) => `${ key }#${ index }`;

const parseItemKey = (key: string): { collection: CollectionId; id: string } | null => {
  for (const collection of SYNC_PRIORITY) {
    const prefix = COLLECTION_PREFIX[collection];
    if (key.startsWith(prefix) && !key.includes('#')) {
      return { collection, id: key.slice(prefix.length) };
    }
  }
  return null;
};

const splitJsonPayload = (json: string, keyBase: string): string[] => {
  if (!json.length) return [ '' ];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < json.length) {
    const key = `${ keyBase }#${ chunks.length }`;
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

type ChunkMeta = { __ttChunk: true; count: number; updatedAt?: number };

const isChunkMeta = (value: any): value is ChunkMeta =>
  value && typeof value === 'object' && value.__ttChunk === true && Number(value.count) >= 0;

const readChunked = async (
  area: typeof chrome.storage.local | typeof chrome.storage.sync,
  key: string,
  meta: ChunkMeta,
) => {
  const count = Number(meta.count) || 0;
  if (!count) return null;
  const keys = Array.from({ length: count }, (_, i) => chunkKey(key, i));
  const stored = await area.get(keys);
  const json = keys.map(k => (typeof stored[k] === 'string' ? stored[k] : '')).join('');
  try {
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

const removeChunkKeys = async (
  area: typeof chrome.storage.local | typeof chrome.storage.sync,
  key: string,
  previousCount = 64,
) => {
  const keys = [
    key,
    ...Array.from({ length: previousCount }, (_, i) => chunkKey(key, i)),
  ];
  await area.remove(keys);
};

const writeAreaValue = async (
  area: typeof chrome.storage.local | typeof chrome.storage.sync,
  key: string,
  value: any,
) => {
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
  const meta: ChunkMeta = {
    __ttChunk: true,
    count: chunks.length,
    updatedAt: getUpdatedAt(value),
  };
  const payload: Record<string, any> = { [key]: meta };
  chunks.forEach((chunk, index) => {
    payload[chunkKey(key, index)] = chunk;
  });
  await area.set(payload);
  if (prevCount > chunks.length) {
    await area.remove(
      Array.from({ length: prevCount - chunks.length }, (_, i) => chunkKey(key, chunks.length + i)),
    );
  }
};

const readAreaValue = async (
  area: typeof chrome.storage.local | typeof chrome.storage.sync,
  key: string,
) => {
  const stored = await area.get(key);
  const value = stored?.[key];
  if (value === undefined) return undefined;
  if (isChunkMeta(value)) return readChunked(area, key, value);
  return value;
};

let writeQueue: Promise<unknown> = Promise.resolve();
const enqueueWrite = async <T,>(task: () => Promise<T>): Promise<T> => {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
};

const readLocations = async (): Promise<Record<string, ItemLocation>> => {
  const data = await chrome.storage.local.get(LOC_KEY);
  return (data?.[LOC_KEY] && typeof data[LOC_KEY] === 'object') ? data[LOC_KEY] : {};
};

const writeLocations = async (locations: Record<string, ItemLocation>) => {
  await chrome.storage.local.set({ [LOC_KEY]: locations });
};

const readIndex = async (collection: CollectionId): Promise<string[]> => {
  const data = await chrome.storage.local.get(INDEX_KEY[collection]);
  const value = data?.[INDEX_KEY[collection]];
  return Array.isArray(value) ? value.map(String) : [];
};

const writeIndex = async (collection: CollectionId, ids: string[]) => {
  await chrome.storage.local.set({ [INDEX_KEY[collection]]: ids.map(String) });
};

const itemIdOf = (collection: CollectionId, item: any): string => {
  if (collection === 'ignoreList') {
    return `${ item.boardID }:${ item.forumID }`;
  }
  if (collection === 'ignoredTopicsList') {
    return `${ item.boardID }`;
  }
  return String(item.id);
};

const flattenIgnoreUsers = (boards: any[] = []) => {
  const items: any[] = [];
  boards.forEach(board => {
    (board.forums || []).forEach((forum: any) => {
      const users = forum.users || [];
      const updatedAt = Math.max(
        0,
        ...users.map((u: any) => getUpdatedAt(u)),
        getUpdatedAt(board),
        getUpdatedAt(forum),
      ) || Date.now();
      items.push({
        boardID: board.boardID,
        boardName: board.boardName,
        boardUrl: board.boardUrl,
        forumID: forum.forumID,
        forumName: forum.forumName,
        users,
        updatedAt,
      });
    });
  });
  return items;
};

const assembleIgnoreUsers = (items: any[] = []) => {
  const boards = new Map<string, any>();
  items.forEach(item => {
    if (!boards.has(String(item.boardID))) {
      boards.set(String(item.boardID), {
        boardID: item.boardID,
        boardName: item.boardName,
        boardUrl: item.boardUrl,
        forums: [],
      });
    }
    const board = boards.get(String(item.boardID));
    board.forums.push({
      forumID: item.forumID,
      forumName: item.forumName,
      users: item.users || [],
    });
  });
  return [ ...boards.values() ];
};

const normalizeIgnoredTopics = (boards: any[] = []) =>
  boards.map(board => ({
    ...board,
    updatedAt: Math.max(
      0,
      getUpdatedAt(board),
      ...(board.topics || []).map((t: any) => getUpdatedAt(t)),
    ) || Date.now(),
  }));

const collectionFromLegacyKey = (key: string): CollectionId | null =>
  LEGACY_ARRAY_KEYS.includes(key as CollectionId) ? key as CollectionId : null;

const listLocalItemKeys = async (collection: CollectionId) => {
  const all = await chrome.storage.local.get(null);
  const prefix = COLLECTION_PREFIX[collection];
  return Object.keys(all).filter(key => key.startsWith(prefix) && !key.includes('#'));
};

const listSyncItemKeys = async (collection: CollectionId) => {
  const all = await chrome.storage.sync.get(null);
  const prefix = COLLECTION_PREFIX[collection];
  return Object.keys(all).filter(key => key.startsWith(prefix) && !key.includes('#'));
};

const estimateSize = (value: any) => serializedBytes(value);

const demoteCandidates = async (
  locations: Record<string, ItemLocation>,
  /** Only demote collections with priority index strictly greater than this. */
  demoteBelowPriority: number = -1,
) => {
  const candidates: { collection: CollectionId; id: string; key: string; size: number; updatedAt: number }[] = [];

  for (const collection of [ ...SYNC_PRIORITY ].reverse()) {
    if (priorityIndex(collection) <= demoteBelowPriority) continue;
    for (const key of await listSyncItemKeys(collection)) {
      const loc = locations[key];
      if (loc === 'localPinned') continue;
      const value = await readAreaValue(chrome.storage.sync, key);
      if (value === undefined || value === null) continue;
      const parsed = parseItemKey(key);
      if (!parsed) continue;
      candidates.push({
        collection,
        id: parsed.id,
        key,
        size: estimateSize(value),
        updatedAt: getUpdatedAt(value),
      });
    }
  }

  candidates.sort((a, b) => {
    const p = priorityIndex(b.collection) - priorityIndex(a.collection);
    if (p) return p; // lower priority (higher index) first
    if (b.size !== a.size) return b.size - a.size;
    return a.updatedAt - b.updatedAt;
  });

  return candidates;
};

const removeFromSync = async (key: string) => {
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

const tryWriteToSync = async (key: string, value: any) => {
  lastSyncWriteFail = null;
  if (isSyncRateLimited()) {
    lastSyncWriteFail = 'rate';
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
      lastSyncWriteFail = 'quota';
      return false;
    }
    throw error;
  }
};

const syncItem = async (
  collection: CollectionId,
  id: string,
  value: any,
  locations: Record<string, ItemLocation>,
  options: { allowDemote?: boolean } = {},
): Promise<ItemLocation> => {
  const key = itemKey(collection, id);
  const allowDemote = options.allowDemote !== false;

  if (locations[key] === 'localPinned') {
    await removeFromSync(key);
    return 'localPinned';
  }

  if (await tryWriteToSync(key, value)) {
    locations[key] = 'sync';
    return 'sync';
  }

  // Rate limit: don't demote/remove — that spends more write ops.
  if (lastSyncWriteFail === 'rate' || isSyncRateLimited()) {
    locations[key] = 'local';
    return 'local';
  }

  if (allowDemote) {
    for (const candidate of await demoteCandidates(locations, priorityIndex(collection))) {
      if (candidate.key === key) continue;
      if (isSyncRateLimited()) break;
      // Keep local copy (already source of truth), drop sync.
      await removeFromSync(candidate.key);
      locations[candidate.key] = locations[candidate.key] === 'localPinned' ? 'localPinned' : 'local';
      await writeLocations(locations);
      if (await tryWriteToSync(key, value)) {
        locations[key] = 'sync';
        return 'sync';
      }
      if (lastSyncWriteFail === 'rate' || isSyncRateLimited()) {
        locations[key] = 'local';
        return 'local';
      }
    }
  }

  await removeFromSync(key);
  locations[key] = 'local';
  return 'local';
};

/** Try to push auto-demoted (`local`) items back to sync when space allows. No demotion. */
const promoteLocalItems = async (locations: Record<string, ItemLocation>) => {
  if (isSyncRateLimited()) return;

  for (const collection of SYNC_PRIORITY) {
    const ids = await readIndex(collection);
    const pending: { id: string; key: string; value: any; size: number }[] = [];

    for (const id of ids) {
      const key = itemKey(collection, id);
      if (locations[key] !== 'local') continue;
      const value = await readLocalItem(key);
      if (value == null) continue;
      pending.push({ id, key, value, size: estimateSize(value) });
    }

    // Smaller first — pack more items into freed quota.
    pending.sort((a, b) => a.size - b.size || a.id.localeCompare(b.id));

    for (const item of pending) {
      if (isSyncRateLimited()) return;
      const loc = await syncItem(collection, item.id, item.value, locations, { allowDemote: false });
      locations[item.key] = loc;
      if (loc === 'local' && (lastSyncWriteFail === 'rate' || isSyncRateLimited())) {
        return;
      }
    }
  }
};

const writeLocalItem = async (key: string, value: any) => {
  await writeAreaValue(chrome.storage.local, key, value);
};

const readLocalItem = async (key: string) => readAreaValue(chrome.storage.local, key);

const readSyncItem = async (key: string) => readAreaValue(chrome.storage.sync, key);

const upsertCollectionItem = async (
  collection: CollectionId,
  item: any,
  locations: Record<string, ItemLocation>,
) => {
  const prepared = ensureUpdatedAt(item);
  const id = itemIdOf(collection, prepared);
  const key = itemKey(collection, id);
  await writeLocalItem(key, prepared);
  const location = await syncItem(collection, id, prepared, locations);
  locations[key] = location;
  return { id, key, location, item: prepared };
};

const removeCollectionItem = async (
  collection: CollectionId,
  id: string,
  locations: Record<string, ItemLocation>,
) => {
  const key = itemKey(collection, id);
  const localMeta = await chrome.storage.local.get(key);
  const count = isChunkMeta(localMeta?.[key]) ? Number(localMeta[key].count) || 0 : 0;
  await removeChunkKeys(chrome.storage.local, key, Math.max(count, 16));
  await removeFromSync(key);
  delete locations[key];
};

const loadCollectionItems = async (collection: CollectionId) => {
  const locations = await readLocations();
  let ids = await readIndex(collection);

  // Discover sync-only / local-only keys and merge.
  const localKeys = await listLocalItemKeys(collection);
  const syncKeys = await listSyncItemKeys(collection);
  const allIds = new Set<string>([
    ...ids,
    ...localKeys.map(key => parseItemKey(key)?.id).filter(Boolean) as string[],
    ...syncKeys.map(key => parseItemKey(key)?.id).filter(Boolean) as string[],
  ]);

  const items: any[] = [];
  const nextIds: string[] = [];
  let locationsChanged = false;

  for (const id of allIds) {
    const key = itemKey(collection, id);
    const localValue = await readLocalItem(key);
    const syncValue = await readSyncItem(key);
    let value: any;

    if (localValue != null && syncValue != null) {
      value = pickNewer(localValue, syncValue);
      // On tie pickNewer returns sync; always persist winner locally.
      if (JSON.stringify(value) !== JSON.stringify(localValue)) {
        await writeLocalItem(key, value);
      }
      if (
        locations[key] !== 'localPinned'
        && JSON.stringify(value) !== JSON.stringify(syncValue)
        && getUpdatedAt(value) > getUpdatedAt(syncValue)
      ) {
        const loc = await syncItem(collection, id, value, locations, { allowDemote: false });
        locations[key] = loc;
        locationsChanged = true;
      }
    } else if (localValue != null) {
      value = localValue;
      if (!locations[key]) {
        locations[key] = 'local';
        locationsChanged = true;
      }
    } else if (syncValue != null) {
      value = syncValue;
      await writeLocalItem(key, value);
      locations[key] = 'sync';
      locationsChanged = true;
    } else {
      continue;
    }

    items.push(value);
    nextIds.push(id);
  }

  // Preserve previous order when possible.
  const ordered = [
    ...ids.filter(id => nextIds.includes(id)),
    ...nextIds.filter(id => !ids.includes(id)),
  ];
  if (JSON.stringify(ordered) !== JSON.stringify(ids)) {
    await writeIndex(collection, ordered);
  } else if (!ids.length && ordered.length) {
    await writeIndex(collection, ordered);
  }

  if (locationsChanged) await writeLocations(locations);

  const byId = new Map(items.map(item => [ itemIdOf(collection, item), item ]));
  return ordered.map(id => byId.get(id)).filter(Boolean);
};

const replaceCollection = async (collection: CollectionId, list: any[]) => {
  return enqueueWrite(async () => {
    await ensureMigrated();
    const locations = await readLocations();
    const previousIds = await readIndex(collection);
    const nextItems = collection === 'ignoreList'
      ? flattenIgnoreUsers(list)
      : collection === 'ignoredTopicsList'
        ? normalizeIgnoredTopics(list)
        : (Array.isArray(list) ? list : []).map(ensureUpdatedAt);

    const nextIds = nextItems.map(item => itemIdOf(collection, item));
    const nextIdSet = new Set(nextIds);

    for (const id of previousIds) {
      if (!nextIdSet.has(id)) {
        await removeCollectionItem(collection, id, locations);
      }
    }

    // Also remove orphan keys not in index.
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
    // After deletes/updates, try to pull auto-local items back into sync.
    await promoteLocalItems(locations);
    await writeLocations(locations);

    const worst = nextIds.some(id => {
      const loc = locations[itemKey(collection, id)];
      return loc === 'local' || loc === 'localPinned';
    });

    return {
      location: worst ? 'local' as const : 'sync' as const,
      fallback: worst,
    };
  });
};

const readCollectionFacade = async (collection: CollectionId) => {
  await ensureMigrated();
  const items = await loadCollectionItems(collection);
  if (collection === 'ignoreList') return assembleIgnoreUsers(items);
  return items;
};

/* ---------------- Migration from legacy ---------------- */

const readLegacyChunked = async (key: string, areaData: Record<string, any>, area: 'sync' | 'local') => {
  const meta = areaData?.[`${ key }__chunks`];
  const count = Number(meta?.count) || 0;
  if (!(meta && count >= 0)) {
    return Array.isArray(areaData?.[key]) ? areaData[key] : null;
  }
  if (!count) return [];
  const store = area === 'sync' ? chrome.storage.sync : chrome.storage.local;
  const keys = Array.from({ length: count }, (_, i) => `${ key }__chunk_${ i }`);
  const stored = await store.get(keys);
  if (meta.encoding === 'json' || meta.version === 2) {
    const json = keys.map(k => (typeof stored[k] === 'string' ? stored[k] : '')).join('');
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return keys.flatMap(k => (Array.isArray(stored[k]) ? stored[k] : []));
};

const mergeLegacyLists = (localList: any[], syncList: any[], getId: (item: any) => string) => {
  const map = new Map<string, any>();
  [ ...syncList, ...localList ].forEach(item => {
    if (!item) return;
    const id = getId(item);
    const prev = map.get(id);
    map.set(id, prev ? pickNewer(prev, item) : item);
  });
  // Prefer local when timestamps equal was handled by pickNewer(tie→second).
  // Re-merge properly: for each id, pick newer with sync as tie-breaker.
  const syncMap = new Map(syncList.map(item => [ getId(item), item ]));
  const localMap = new Map(localList.map(item => [ getId(item), item ]));
  const ids = new Set([ ...syncMap.keys(), ...localMap.keys() ]);
  const result: any[] = [];
  ids.forEach(id => {
    const local = localMap.get(id);
    const sync = syncMap.get(id);
    if (local && sync) result.push(pickNewer(local, sync));
    else result.push(local ?? sync);
  });
  return result;
};

let migrationPromise: Promise<void> | null = null;

const runMigration = async () => {
  const state = await chrome.storage.local.get(MIGRATION_KEY);
  if (state?.[MIGRATION_KEY] === MIGRATION_VERSION) return;

  const syncAll = await chrome.storage.sync.get(null);
  const localAll = await chrome.storage.local.get(null);

  const locations: Record<string, ItemLocation> = {};

  // Templates / stickers / favorites
  for (const collection of [ 'favoriteTopics', 'templates', 'stickerPack' ] as CollectionId[]) {
    const syncList = (await readLegacyChunked(collection, syncAll, 'sync')) || [];
    const localList = (await readLegacyChunked(collection, localAll, 'local'))
      || (Array.isArray(localAll[collection]) ? localAll[collection] : []);
    const merged = mergeLegacyLists(
      Array.isArray(localList) ? localList : [],
      Array.isArray(syncList) ? syncList : [],
      item => String(item.id),
    );
    const ids: string[] = [];
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

  // Ignore users — per forum section
  {
    const syncList = Array.isArray(syncAll.ignoreList) ? syncAll.ignoreList : [];
    const localList = Array.isArray(localAll.ignoreList) ? localAll.ignoreList : [];
    const syncFlat = flattenIgnoreUsers(syncList);
    const localFlat = flattenIgnoreUsers(localList);
    const merged = mergeLegacyLists(localFlat, syncFlat, item => `${ item.boardID }:${ item.forumID }`);
    const ids: string[] = [];
    for (const item of merged) {
      const prepared = ensureUpdatedAt(item);
      const id = itemIdOf('ignoreList', prepared);
      const key = itemKey('ignoreList', id);
      await writeLocalItem(key, prepared);
      ids.push(id);
      locations[key] = await syncItem('ignoreList', id, prepared, locations);
    }
    await writeIndex('ignoreList', ids);
  }

  // Ignore topics — per board
  {
    const syncList = normalizeIgnoredTopics(Array.isArray(syncAll.ignoredTopicsList) ? syncAll.ignoredTopicsList : []);
    const localList = normalizeIgnoredTopics(Array.isArray(localAll.ignoredTopicsList) ? localAll.ignoredTopicsList : []);
    const merged = mergeLegacyLists(localList, syncList, item => String(item.boardID));
    const ids: string[] = [];
    for (const item of merged) {
      const prepared = ensureUpdatedAt(item);
      const id = itemIdOf('ignoredTopicsList', prepared);
      const key = itemKey('ignoredTopicsList', id);
      await writeLocalItem(key, prepared);
      ids.push(id);
      locations[key] = await syncItem('ignoredTopicsList', id, prepared, locations);
    }
    await writeIndex('ignoredTopicsList', ids);
  }

  await writeLocations(locations);

  // Cleanup legacy keys
  const legacyRemoveSync: string[] = [
    'ignoreList',
    'ignoredTopicsList',
    'stickerPack',
    'templates',
    'favoriteTopics',
    FALLBACKS_KEY,
    'migrationPending',
    'migrationConflicts',
    'migrationDone',
    ...LEGACY_CHUNK_META,
  ];
  for (const key of Object.keys(syncAll)) {
    if (/__(chunk_|chunks)/.test(key) || key.includes('__chunk_')) {
      legacyRemoveSync.push(key);
    }
  }
  try {
    await chrome.storage.sync.remove([ ...new Set(legacyRemoveSync) ]);
  } catch (error) {
    if (!isSyncWriteBlockedError(error)) throw error;
    if (isWriteRateLimitError(error)) markSyncRateLimited();
  }

  const legacyRemoveLocal = [
    'ignoreList',
    'ignoredTopicsList',
    'stickerPack',
    'templates',
    'favoriteTopics',
    FALLBACKS_KEY,
    'migrationPending',
    'migrationConflicts',
    'migrationDone',
    ...LEGACY_CHUNK_META,
  ];
  for (const key of Object.keys(localAll)) {
    if (/__(chunk_|chunks)/.test(key) || key.includes('__chunk_')) {
      legacyRemoveLocal.push(key);
    }
  }
  await chrome.storage.local.remove([ ...new Set(legacyRemoveLocal) ]);

  await chrome.storage.local.set({ [MIGRATION_KEY]: MIGRATION_VERSION });
};

export const ensureMigrated = async () => {
  if (!migrationPromise) {
    migrationPromise = runMigration().catch(error => {
      migrationPromise = null;
      throw error;
    });
  }
  await migrationPromise;
};

/* ---------------- Public facade (legacy array API) ---------------- */

export type SafeSetResult = {
  location: 'sync' | 'local' | 'partial';
  fallback: boolean;
};

export const safeStorageGet = async <T = Record<string, any>>(keys: string[]): Promise<T> => {
  await ensureMigrated();
  const result: Record<string, any> = {};
  for (const key of keys) {
    const collection = collectionFromLegacyKey(key);
    if (collection) {
      result[key] = await readCollectionFacade(collection);
    } else {
      const [ syncData, localData ] = await Promise.all([
        chrome.storage.sync.get(key),
        chrome.storage.local.get(key),
      ]);
      result[key] = syncData?.[key] ?? localData?.[key];
    }
  }
  return result as T;
};

export const safeStorageSet = async (data: Record<string, any>): Promise<SafeSetResult> => {
  await ensureMigrated();
  let worst: 'sync' | 'local' | 'partial' = 'sync';

  const regular: Record<string, any> = { ...data };
  for (const collection of LEGACY_ARRAY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(regular, collection)) continue;
    const list = regular[collection];
    delete regular[collection];
    const result = await replaceCollection(collection, list);
    if (result.fallback) worst = 'local';
  }

  for (const key of Object.keys(regular)) {
    try {
      if (isSyncRateLimited()) throw new Error('MAX_WRITE_OPERATIONS_PER_MINUTE');
      await chrome.storage.sync.set({ [key]: regular[key] });
      await chrome.storage.local.remove(key);
    } catch (error) {
      if (!isSyncWriteBlockedError(error)) throw error;
      if (isWriteRateLimitError(error)) markSyncRateLimited();
      await chrome.storage.local.set({ [key]: regular[key] });
      worst = 'local';
    }
  }

  return { location: worst, fallback: worst !== 'sync' };
};

export const getItemLocation = async (
  collection: CollectionId,
  id: string | number,
): Promise<ItemLocation> => {
  await ensureMigrated();
  const locations = await readLocations();
  return locations[itemKey(collection, id)] || 'local';
};

export const getCollectionLocations = async (
  collection: CollectionId,
): Promise<Record<string, ItemLocation>> => {
  await ensureMigrated();
  const locations = await readLocations();
  const prefix = COLLECTION_PREFIX[collection];
  const result: Record<string, ItemLocation> = {};
  Object.entries(locations).forEach(([ key, loc ]) => {
    if (key.startsWith(prefix)) {
      result[key.slice(prefix.length)] = loc;
    }
  });
  return result;
};

export type CloudPinResult = {
  location: ItemLocation;
  error?: string;
};

export const CLOUD_UPLOAD_NO_SPACE =
  'Не удалось добавить в Chrome Sync — сначала освободите место.';

export const CLOUD_UPLOAD_RATE_LIMITED =
  'Слишком много записей в Chrome Sync. Подождите около минуты и попробуйте снова.';

/** Toggle cloud: sync ↔ localPinned. Auto-local → localPinned on pin request. */
export const setItemCloudPinned = async (
  collection: CollectionId,
  id: string | number,
  pinnedLocal: boolean,
): Promise<CloudPinResult> => {
  return enqueueWrite(async () => {
    await ensureMigrated();
    const locations = await readLocations();
    const key = itemKey(collection, String(id));
    const value = await readLocalItem(key);
    if (value == null) {
      return { location: locations[key] || 'local' };
    }

    if (pinnedLocal) {
      await removeFromSync(key);
      locations[key] = 'localPinned';
      await writeLocations(locations);
      return { location: 'localPinned' };
    }

    // Manual upload: try without demoting others; keep localPinned if no space.
    locations[key] = 'local';
    const loc = await syncItem(collection, String(id), value, locations, { allowDemote: false });
    if (loc !== 'sync') {
      locations[key] = 'localPinned';
      await writeLocations(locations);
      const error = lastSyncWriteFail === 'rate' || isSyncRateLimited()
        ? CLOUD_UPLOAD_RATE_LIMITED
        : CLOUD_UPLOAD_NO_SPACE;
      return { location: 'localPinned', error };
    }

    locations[key] = 'sync';
    await promoteLocalItems(locations);
    await writeLocations(locations);
    return { location: 'sync' };
  });
};

export const getStorageFallbacks = async (): Promise<StorageFallbackMap> => {
  await ensureMigrated();
  const locations = await readLocations();
  const fallbacks: StorageFallbackMap = {};

  for (const collection of LEGACY_ARRAY_KEYS) {
    const prefix = COLLECTION_PREFIX[collection];
    const localIds: string[] = [];
    let allLocal = true;
    let any = false;
    Object.entries(locations).forEach(([ key, loc ]) => {
      if (!key.startsWith(prefix)) return;
      any = true;
      if (loc === 'sync') allLocal = false;
      else localIds.push(key.slice(prefix.length));
    });
    if (!any) continue;
    if (allLocal && localIds.length) fallbacks[collection] = 'local';
    else if (localIds.length) fallbacks[collection] = { localIds };
  }
  return fallbacks;
};

export const isStorageKeyLocal = (fallbacks: StorageFallbackMap, key: string) => {
  const entry = fallbacks[key];
  return entry === 'local'
    || (typeof entry === 'object' && Array.isArray(entry.localIds) && entry.localIds.length > 0);
};

export const isStorageItemLocal = (
  fallbacks: StorageFallbackMap,
  key: string,
  id: number | string,
) => {
  const entry = fallbacks[key];
  if (!entry) return false;
  if (entry === 'local') return true;
  return entry.localIds.some(localId => String(localId) === String(id));
};

export const isChunkedStorageChange = (
  changes: Record<string, chrome.storage.StorageChange>,
  key: string,
) => {
  const collection = collectionFromLegacyKey(key);
  if (!collection) return Boolean(changes[key]);
  const prefix = COLLECTION_PREFIX[collection];
  if (changes[INDEX_KEY[collection]] || changes[LOC_KEY]) return true;
  return Object.keys(changes).some(changeKey => changeKey.startsWith(prefix));
};

export const safeStoragePromoteFallbacks = async (): Promise<void> => {
  await ensureMigrated();
  await enqueueWrite(async () => {
    const locations = await readLocations();
    await promoteLocalItems(locations);
    await writeLocations(locations);
  });
};
