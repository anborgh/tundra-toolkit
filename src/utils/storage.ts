const FALLBACKS_KEY = '__tt_storage_fallbacks__';

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

export type SafeSetResult = {
  location: 'sync' | 'local';
  fallback: boolean;
};

export const safeStorageSet = async (data: Record<string, any>): Promise<SafeSetResult> => {
  const keys = Object.keys(data);
  const fallbacks = await readFallbacks();

  try {
    await chrome.storage.sync.set(data);
    keys.forEach(key => delete fallbacks[key]);
    await writeFallbacks(fallbacks);
    await chrome.storage.local.remove(keys);
    return { location: 'sync', fallback: false };
  } catch (error) {
    if (isQuotaError(error)) {
      keys.forEach(key => { fallbacks[key] = 'local'; });
      await chrome.storage.local.set(data);
      await writeFallbacks(fallbacks);
      return { location: 'local', fallback: true };
    }
    throw error;
  }
};

export const safeStorageGet = async <T = Record<string, any>>(keys: string[]): Promise<T> => {
  const fallbacks = await readFallbacks();
  const [syncData, localData] = await Promise.all([
    keys.length ? chrome.storage.sync.get(keys) : Promise.resolve({}),
    keys.length ? chrome.storage.local.get(keys) : Promise.resolve({}),
  ]);

  const result: Record<string, any> = {};
  keys.forEach(key => {
    if (fallbacks[key] === 'local') {
      result[key] = localData?.[key];
    } else {
      result[key] = syncData?.[key] ?? localData?.[key];
    }
  });

  return result as T;
};
