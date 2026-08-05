const FALLBACKS_KEY = '__tt_storage_fallbacks__';
const CHUNK_TARGET_BYTES = 7500;

/** Higher index = lower sync priority. */
const SYNC_PRIORITY = [
  'favoriteTopics',
  'templates',
  'stickerPack',
  'ignoreList',
  'ignoredTopicsList',
] as const;

const PARTIAL_OVERFLOW_KEYS = new Set([ 'templates', 'stickerPack' ]);

type ChunkMode = 'items' | 'json';

type ChunkedKeyConfig = {
  key: string;
  chunksKey: string;
  chunkPrefix: string;
  mode: ChunkMode;
};

export type StorageFallbackEntry = 'local' | { localIds: Array<number | string> };
export type StorageFallbackMap = Record<string, StorageFallbackEntry>;

const CHUNKED_KEY_CONFIGS: ChunkedKeyConfig[] = [
  {
    key: 'favoriteTopics',
    chunksKey: 'favoriteTopics__chunks',
    chunkPrefix: 'favoriteTopics__chunk_',
    mode: 'items',
  },
  {
    key: 'templates',
    chunksKey: 'templates__chunks',
    chunkPrefix: 'templates__chunk_',
    mode: 'json',
  },
  {
    key: 'stickerPack',
    chunksKey: 'stickerPack__chunks',
    chunkPrefix: 'stickerPack__chunk_',
    mode: 'json',
  },
];

const chunkedConfigByKey = Object.fromEntries(
  CHUNKED_KEY_CONFIGS.map(config => [ config.key, config ]),
) as Record<string, ChunkedKeyConfig>;

const isQuotaError = (error: any) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${error}`;
  return /QUOTA_BYTES_PER_ITEM|quota.*bytes/i.test(message);
};

const priorityIndex = (key: string) => {
  const index = SYNC_PRIORITY.indexOf(key as typeof SYNC_PRIORITY[number]);
  return index >= 0 ? index : SYNC_PRIORITY.length;
};

const lowerPriorityKeys = (key: string) =>
  SYNC_PRIORITY.filter((_, index) => index > priorityIndex(key));

const sortKeysByPriority = (keys: string[]) =>
  [ ...keys ].sort((a, b) => priorityIndex(a) - priorityIndex(b));

const readFallbacks = async (): Promise<StorageFallbackMap> => {
  try {
    const data = await chrome.storage.sync.get(FALLBACKS_KEY);
    return (data?.[FALLBACKS_KEY] || {}) as StorageFallbackMap;
  } catch (e) {
    return {};
  }
};

export const getStorageFallbacks = (): Promise<StorageFallbackMap> => readFallbacks();

export const STORAGE_FALLBACKS_KEY = FALLBACKS_KEY;

export const isStorageKeyLocal = (fallbacks: StorageFallbackMap, key: string) => {
  const entry = fallbacks[key];
  return entry === 'local' || (typeof entry === 'object' && Array.isArray(entry.localIds) && entry.localIds.length > 0);
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
  const config = chunkedConfigByKey[key];
  if (!config) return Boolean(changes[key]);
  if (changes[key] || changes[config.chunksKey]) return true;
  return Object.keys(changes).some(changeKey => changeKey.startsWith(config.chunkPrefix));
};

const writeFallbacks = async (fallbacks: StorageFallbackMap) => {
  try {
    await chrome.storage.sync.set({ [FALLBACKS_KEY]: fallbacks });
  } catch (e) {
  }
};

const serializedBytes = (value: any) => new TextEncoder().encode(JSON.stringify(value)).length;

const chunkKeys = (config: ChunkedKeyConfig, count: number) =>
  Array.from({ length: count }, (_, index) => `${ config.chunkPrefix }${ index }`);

const splitItems = (items: any[]) => {
  const chunks: any[][] = [];
  let current: any[] = [];

  items.forEach(item => {
    const candidate = [ ...current, item ];
    if (current.length && serializedBytes(candidate) > CHUNK_TARGET_BYTES) {
      chunks.push(current);
      current = [ item ];
    } else {
      current = candidate;
    }
  });

  if (current.length) chunks.push(current);
  return chunks;
};

const splitJsonPayload = (json: string, chunkPrefix: string): string[] => {
  if (!json.length) return [ '' ];

  const chunks: string[] = [];
  let offset = 0;

  while (offset < json.length) {
    const key = `${ chunkPrefix }${ chunks.length }`;
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

const buildChunkPayload = (config: ChunkedKeyConfig, items: any[]) => {
  if (config.mode === 'json') {
    const chunks = splitJsonPayload(JSON.stringify(items), config.chunkPrefix);
    return {
      chunkData: Object.fromEntries(
        chunks.map((chunk, index) => [ `${ config.chunkPrefix }${ index }`, chunk ]),
      ),
      meta: { version: 2, count: chunks.length, encoding: 'json' as const },
      count: chunks.length,
    };
  }

  const chunks = splitItems(items);
  return {
    chunkData: Object.fromEntries(
      chunks.map((chunk, index) => [ `${ config.chunkPrefix }${ index }`, chunk ]),
    ),
    meta: { version: 1, count: chunks.length },
    count: chunks.length,
  };
};

const removeChunkedFromSync = async (config: ChunkedKeyConfig) => {
  const previous = await chrome.storage.sync.get(config.chunksKey);
  const previousCount = Number(previous?.[config.chunksKey]?.count) || 0;
  await chrome.storage.sync.remove([
    config.key,
    config.chunksKey,
    ...chunkKeys(config, previousCount),
  ]);
};

const tryWriteChunkedToSync = async (config: ChunkedKeyConfig, items: any[]) => {
  const previous = await chrome.storage.sync.get(config.chunksKey);
  const previousCount = Number(previous?.[config.chunksKey]?.count) || 0;
  const { chunkData, meta, count } = buildChunkPayload(config, items);

  try {
    await chrome.storage.sync.set({
      ...chunkData,
      [config.chunksKey]: meta,
    });
    const staleChunkKeys = chunkKeys(config, previousCount).slice(count);
    await chrome.storage.sync.remove([ config.key, ...staleChunkKeys ]);
    return true;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    return false;
  }
};

const readChunkedFromSyncData = async (
  config: ChunkedKeyConfig,
  syncData: Record<string, any>,
) => {
  const meta = syncData?.[config.chunksKey];
  const count = Number(meta?.count) || 0;
  if (!(meta && count >= 0)) return null;
  if (!count) return [];

  const storedChunks = await chrome.storage.sync.get(chunkKeys(config, count));
  if (meta.encoding === 'json' || meta.version === 2) {
    const json = chunkKeys(config, count)
      .map(key => (typeof storedChunks[key] === 'string' ? storedChunks[key] : ''))
      .join('');
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  return chunkKeys(config, count)
    .flatMap(key => (Array.isArray(storedChunks[key]) ? storedChunks[key] : []));
};

const readKeyValueForDemote = async (
  key: string,
  fallbacks: StorageFallbackMap,
): Promise<any> => {
  const config = chunkedConfigByKey[key];
  if (!config) {
    if (fallbacks[key] === 'local') {
      const localData = await chrome.storage.local.get(key);
      return localData?.[key];
    }
    const [ syncData, localData ] = await Promise.all([
      chrome.storage.sync.get(key),
      chrome.storage.local.get(key),
    ]);
    return syncData?.[key] ?? localData?.[key];
  }

  if (fallbacks[key] === 'local') {
    const localData = await chrome.storage.local.get(key);
    return localData?.[key];
  }

  const syncMeta = await chrome.storage.sync.get([ config.key, config.chunksKey ]);
  const chunked = await readChunkedFromSyncData(config, syncMeta);
  if (chunked) {
    const entry = fallbacks[key];
    if (typeof entry === 'object' && Array.isArray(entry.localIds) && entry.localIds.length) {
      const localData = await chrome.storage.local.get(key);
      const localItems = Array.isArray(localData?.[key]) ? localData[key] : [];
      const syncIds = new Set(chunked.map((item: any) => String(item?.id)));
      return [
        ...chunked,
        ...localItems.filter((item: any) => !syncIds.has(String(item?.id))),
      ];
    }
    return chunked;
  }

  const [ syncData, localData ] = await Promise.all([
    chrome.storage.sync.get(config.key),
    chrome.storage.local.get(config.key),
  ]);
  return syncData?.[config.key] ?? localData?.[config.key];
};

const demoteKeyToLocal = async (key: string, fallbacks: StorageFallbackMap) => {
  if (fallbacks[key] === 'local') return false;

  const value = await readKeyValueForDemote(key, fallbacks);
  if (value === undefined) return false;

  await chrome.storage.local.set({ [key]: value });

  const config = chunkedConfigByKey[key];
  if (config) {
    await removeChunkedFromSync(config);
  } else {
    await chrome.storage.sync.remove(key);
  }

  fallbacks[key] = 'local';
  await writeFallbacks(fallbacks);
  return true;
};

const clearLocalMirror = async (config: ChunkedKeyConfig, previousCount = 0) => {
  await chrome.storage.local.remove([
    config.key,
    config.chunksKey,
    ...chunkKeys(config, previousCount),
  ]);
};

const writePartialChunked = async (
  config: ChunkedKeyConfig,
  items: any[],
  fallbacks: StorageFallbackMap,
): Promise<'sync' | 'local' | 'partial'> => {
  let syncItems: any[] = [];
  const rejected: any[] = [];

  for (const item of items) {
    const candidate = [ ...syncItems, item ];
    if (await tryWriteChunkedToSync(config, candidate)) {
      syncItems = candidate;
    } else {
      rejected.push(item);
    }
  }

  const stillLocal: any[] = [];
  for (const item of rejected) {
    const candidate = [ ...syncItems, item ];
    if (await tryWriteChunkedToSync(config, candidate)) {
      syncItems = candidate;
    } else {
      stillLocal.push(item);
    }
  }

  if (!syncItems.length) {
    return 'local';
  }

  if (!stillLocal.length) {
    delete fallbacks[config.key];
    await writeFallbacks(fallbacks);
    await clearLocalMirror(config);
    return 'sync';
  }

  await chrome.storage.local.set({ [config.key]: stillLocal });
  fallbacks[config.key] = {
    localIds: stillLocal.map(item => item?.id).filter(id => id !== undefined && id !== null),
  };
  await writeFallbacks(fallbacks);
  return 'partial';
};

const writeChunkedValue = async (
  config: ChunkedKeyConfig,
  items: any[],
  fallbacks: StorageFallbackMap,
): Promise<'sync' | 'local' | 'partial'> => {
  const markSynced = async () => {
    delete fallbacks[config.key];
    await writeFallbacks(fallbacks);
    await clearLocalMirror(config);
    return 'sync' as const;
  };

  if (await tryWriteChunkedToSync(config, items)) {
    return markSynced();
  }

  for (const lowerKey of [ ...lowerPriorityKeys(config.key) ].reverse()) {
    await demoteKeyToLocal(lowerKey, fallbacks);
    if (await tryWriteChunkedToSync(config, items)) {
      return markSynced();
    }
  }

  if (PARTIAL_OVERFLOW_KEYS.has(config.key) && items.length) {
    const partialResult = await writePartialChunked(config, items, fallbacks);
    if (partialResult !== 'local') return partialResult;
  }

  fallbacks[config.key] = 'local';
  await chrome.storage.local.set({ [config.key]: items });
  await writeFallbacks(fallbacks);
  try {
    await removeChunkedFromSync(config);
  } catch (e) {
  }
  return 'local';
};

const writeRegularKey = async (
  key: string,
  value: any,
  fallbacks: StorageFallbackMap,
): Promise<'sync' | 'local'> => {
  const markSynced = async () => {
    delete fallbacks[key];
    await writeFallbacks(fallbacks);
    await chrome.storage.local.remove(key);
    return 'sync' as const;
  };

  try {
    await chrome.storage.sync.set({ [key]: value });
    return markSynced();
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }

  for (const lowerKey of [ ...lowerPriorityKeys(key) ].reverse()) {
    await demoteKeyToLocal(lowerKey, fallbacks);
    try {
      await chrome.storage.sync.set({ [key]: value });
      return markSynced();
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
  }

  fallbacks[key] = 'local';
  await chrome.storage.local.set({ [key]: value });
  await writeFallbacks(fallbacks);
  return 'local';
};

const mergePartialItems = (syncItems: any[], localItems: any[]) => {
  const syncIds = new Set(syncItems.map(item => String(item?.id)));
  return [
    ...syncItems,
    ...localItems.filter(item => !syncIds.has(String(item?.id))),
  ];
};

const readChunkedValue = async (
  config: ChunkedKeyConfig,
  syncData: Record<string, any>,
  localData: Record<string, any>,
  fallbacks: StorageFallbackMap,
) => {
  const entry = fallbacks[config.key];

  if (entry === 'local') {
    const localValue = localData?.[config.key];
    if (Array.isArray(localValue)) {
      try {
        await writeChunkedValue(config, localValue, fallbacks);
      } catch (e) {
      }
    }
    return localValue;
  }

  if (typeof entry === 'object' && Array.isArray(entry.localIds)) {
    const syncItems = (await readChunkedFromSyncData(config, syncData)) || [];
    const localItems = Array.isArray(localData?.[config.key]) ? localData[config.key] : [];
    const merged = mergePartialItems(syncItems, localItems);
    try {
      await writeChunkedValue(config, merged, fallbacks);
    } catch (e) {
    }
    return merged;
  }

  const chunked = await readChunkedFromSyncData(config, syncData);
  if (chunked) return chunked;

  const legacyValue = syncData?.[config.key] ?? localData?.[config.key];
  if (Array.isArray(syncData?.[config.key])) {
    try {
      await writeChunkedValue(config, syncData[config.key], fallbacks);
    } catch (e) {
    }
  }
  return legacyValue;
};

export type SafeSetResult = {
  location: 'sync' | 'local' | 'partial';
  fallback: boolean;
};

export const safeStorageSet = async (data: Record<string, any>): Promise<SafeSetResult> => {
  const regularData = { ...data };
  const chunkedWrites: { config: ChunkedKeyConfig; items: any[] }[] = [];

  CHUNKED_KEY_CONFIGS.forEach(config => {
    if (!Object.prototype.hasOwnProperty.call(regularData, config.key)) return;
    const value = regularData[config.key];
    delete regularData[config.key];
    chunkedWrites.push({
      config,
      items: Array.isArray(value) ? value : [],
    });
  });

  chunkedWrites.sort((a, b) => priorityIndex(a.config.key) - priorityIndex(b.config.key));

  const fallbacks = await readFallbacks();
  let worst: 'sync' | 'local' | 'partial' = 'sync';

  for (const key of sortKeysByPriority(Object.keys(regularData))) {
    const location = await writeRegularKey(key, regularData[key], fallbacks);
    if (location === 'local') worst = 'local';
  }

  for (const { config, items } of chunkedWrites) {
    const location = await writeChunkedValue(config, items, fallbacks);
    if (location === 'local') worst = 'local';
    else if (location === 'partial' && worst === 'sync') worst = 'partial';
  }

  return {
    location: worst,
    fallback: worst !== 'sync',
  };
};

export const safeStorageGet = async <T = Record<string, any>>(keys: string[]): Promise<T> => {
  const fallbacks = await readFallbacks();
  const chunkedKeys = keys.filter(key => chunkedConfigByKey[key]);
  const regularKeys = keys.filter(key => !chunkedConfigByKey[key]);
  const syncKeys = [
    ...regularKeys,
    ...chunkedKeys.flatMap(key => [ key, chunkedConfigByKey[key].chunksKey ]),
  ];
  const localKeys = [ ...regularKeys, ...chunkedKeys ];
  const [ syncData, localData ] = await Promise.all([
    syncKeys.length ? chrome.storage.sync.get(syncKeys) : Promise.resolve({}),
    localKeys.length ? chrome.storage.local.get(localKeys) : Promise.resolve({}),
  ]);

  const result: Record<string, any> = {};
  regularKeys.forEach(key => {
    if (fallbacks[key] === 'local') {
      result[key] = localData?.[key];
    } else {
      result[key] = syncData?.[key] ?? localData?.[key];
    }
  });

  for (const key of chunkedKeys) {
    result[key] = await readChunkedValue(
      chunkedConfigByKey[key],
      syncData,
      localData,
      fallbacks,
    );
  }

  return result as T;
};
