export const RECENT_STICKERS_KEY = 'recentStickers';
export const RECENT_STICKERS_LIMIT = 6;

export async function getRecentStickers(): Promise<string[]> {
  const data = await chrome.storage.local.get(RECENT_STICKERS_KEY);
  const items = data[RECENT_STICKERS_KEY];
  return Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [];
}

export async function addRecentSticker(src: string): Promise<string[]> {
  const current = await getRecentStickers();
  const next = [ src, ...current.filter(item => item !== src) ].slice(0, RECENT_STICKERS_LIMIT);
  await chrome.storage.local.set({ [RECENT_STICKERS_KEY]: next });
  return next;
}
