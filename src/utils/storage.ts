const FALLBACKS_KEY = '__tt_storage_fallbacks__';
const FAVORITES_KEY = 'favoriteTopics';
const FAVORITES_CHUNKS_KEY = 'favoriteTopics__chunks';
const FAVORITES_CHUNK_PREFIX = 'favoriteTopics__chunk_';
const FAVORITES_CHUNK_TARGET_BYTES = 7500;

const isQuotaError = (error: any) => {
  if (!error) return false;
  const message = typeof error.message === 'string' ? error.message : `${error}`;
  return /QUOTA_BYTES_PER_ITEM|quota.*bytes/i.test(message);
};

const readFallbacks = async (): Promise<Record<string, 'local'>> => {
  try {
    const data = await chrome.storage.sync.get(FALLBACKS_KEY);
    return (data?.[FALLBACKS_KEY] || {}) as Record<string, 'local'>;
  } catch (e) {
    return {};
  }
};

const writeFallbacks = async (fallbacks: Record<string, 'local'>) => {
  try {
    await chrome.storage.sync.set({ [FALLBACKS_KEY]: fallbacks });
  } catch (e) {
  }
};

const serializedBytes = (value: any) => new TextEncoder().encode(JSON.stringify(value)).length;

const splitFavorites = (items: any[]) => {
  const chunks: any[][] = [];
  let current: any[] = [];

  items.forEach(item => {
    const candidate = [ ...current, item ];
    if (current.length && serializedBytes(candidate) > FAVORITES_CHUNK_TARGET_BYTES) {
      chunks.push(current);
      current = [ item ];
    } else {
      current = candidate;
    }
  });

  if (current.length) chunks.push(current);
  return chunks;
};

const favoriteChunkKeys = (count: number) =>
  Array.from({ length: count }, (_, index) => `${ FAVORITES_CHUNK_PREFIX }${ index }`);

const writeChunkedFavorites = async (
  items: any[],
  fallbacks: Record<string, 'local'>,
): Promise<'sync' | 'local'> => {
  const previous = await chrome.storage.sync.get(FAVORITES_CHUNKS_KEY);
  const previousCount = Number(previous?.[FAVORITES_CHUNKS_KEY]?.count) || 0;
  const chunks = splitFavorites(items);
  const chunkData = Object.fromEntries(
    chunks.map((chunk, index) => [ `${ FAVORITES_CHUNK_PREFIX }${ index }`, chunk ]),
  );

  try {
    await chrome.storage.sync.set({
      ...chunkData,
      [FAVORITES_CHUNKS_KEY]: { version: 1, count: chunks.length },
    });

    const staleChunkKeys = favoriteChunkKeys(previousCount).slice(chunks.length);
    await chrome.storage.sync.remove([ FAVORITES_KEY, ...staleChunkKeys ]);
    delete fallbacks[FAVORITES_KEY];
    await writeFallbacks(fallbacks);
    await chrome.storage.local.remove([ FAVORITES_KEY, FAVORITES_CHUNKS_KEY, ...favoriteChunkKeys(previousCount) ]);
    return 'sync';
  } catch (error) {
    if (!isQuotaError(error)) throw error;

    fallbacks[FAVORITES_KEY] = 'local';
    await chrome.storage.local.set({ [FAVORITES_KEY]: items });
    await writeFallbacks(fallbacks);
    return 'local';
  }
};

export type SafeSetResult = {
  location: 'sync' | 'local';
  fallback: boolean;
};

export const safeStorageSet = async (data: Record<string, any>): Promise<SafeSetResult> => {
  const hasFavorites = Object.prototype.hasOwnProperty.call(data, FAVORITES_KEY);
  const favoriteItems = hasFavorites && Array.isArray(data[FAVORITES_KEY]) ? data[FAVORITES_KEY] : [];
  const regularData = { ...data };
  delete regularData[FAVORITES_KEY];
  const keys = Object.keys(regularData);
  const fallbacks = await readFallbacks();
  let usedFallback = false;

  if (keys.length) {
    try {
      await chrome.storage.sync.set(regularData);
      keys.forEach(key => delete fallbacks[key]);
      await writeFallbacks(fallbacks);
      await chrome.storage.local.remove(keys);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      keys.forEach(key => { fallbacks[key] = 'local'; });
      await chrome.storage.local.set(regularData);
      await writeFallbacks(fallbacks);
      usedFallback = true;
    }
  }

  if (hasFavorites) {
    const location = await writeChunkedFavorites(favoriteItems, fallbacks);
    usedFallback ||= location === 'local';
  }

  return {
    location: usedFallback ? 'local' : 'sync',
    fallback: usedFallback,
  };
};

export const safeStorageGet = async <T = Record<string, any>>(keys: string[]): Promise<T> => {
  const fallbacks = await readFallbacks();
  const wantsFavorites = keys.includes(FAVORITES_KEY);
  const regularKeys = keys.filter(key => key !== FAVORITES_KEY);
  const syncKeys = wantsFavorites
    ? [ ...regularKeys, FAVORITES_KEY, FAVORITES_CHUNKS_KEY ]
    : regularKeys;
  const localKeys = wantsFavorites ? [ ...regularKeys, FAVORITES_KEY ] : regularKeys;
  const [syncData, localData] = await Promise.all([
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

  if (wantsFavorites) {
    if (fallbacks[FAVORITES_KEY] === 'local') {
      const localFavorites = localData?.[FAVORITES_KEY];
      result[FAVORITES_KEY] = localFavorites;
      if (Array.isArray(localFavorites)) {
        try {
          await writeChunkedFavorites(localFavorites, fallbacks);
        } catch (e) {
        }
      }
    } else {
      const count = Number(syncData?.[FAVORITES_CHUNKS_KEY]?.count) || 0;
      if (syncData?.[FAVORITES_CHUNKS_KEY] && count >= 0) {
        const chunkData = count
          ? await chrome.storage.sync.get(favoriteChunkKeys(count))
          : {};
        result[FAVORITES_KEY] = favoriteChunkKeys(count)
          .flatMap(key => Array.isArray(chunkData[key]) ? chunkData[key] : []);
      } else {
        const legacyFavorites = syncData?.[FAVORITES_KEY] ?? localData?.[FAVORITES_KEY];
        result[FAVORITES_KEY] = legacyFavorites;
        if (Array.isArray(syncData?.[FAVORITES_KEY])) {
          try {
            await writeChunkedFavorites(syncData[FAVORITES_KEY], fallbacks);
          } catch (e) {
          }
        }
      }
    }
  }

  return result as T;
};
