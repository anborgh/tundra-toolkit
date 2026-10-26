export const decodeEntities = (value?: string) => {
  if (!value) return '';
  if (!value.includes('&')) return value;
  const doc = new DOMParser().parseFromString(value, 'text/html');
  return doc.documentElement.textContent || value;
};

export const checkImageURL = (url: string) => {
    if (!url) return false;

    const pattern = new RegExp('^https?:\\/\\/.+\\.(png|jpg|jpeg|bmp|gif|webp)$', 'i');
    return pattern.test(url);
};

export const isAllowedBoardHost = (host?: string): boolean => {
  if (!host || typeof host !== 'string') return false;

  const raw = host.trim().toLowerCase();
  if (!raw || raw.length > 253) return false;

  let hostname = raw;

  if (raw.startsWith('[')) return false;

  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx > -1 && /^\d+$/.test(raw.slice(colonIdx + 1))) {
    const port = Number(raw.slice(colonIdx + 1));
    hostname = raw.slice(0, colonIdx);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  }

  if (!hostname.includes('.')) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname);
};

export const buildHttpsForumApiUrl = (boardHost: string, query: string): string => {
  if (!isAllowedBoardHost(boardHost)) {
    throw new Error('invalid_board_host');
  }
  const q = String(query || '').replace(/^\?/, '');
  return `https://${boardHost.trim().toLowerCase()}/api.php?${q}`;
};

export const assertHttpsResponse = <T extends Response>(response: T): T => {
  const finalUrl = response.url || '';
  if (finalUrl && !finalUrl.startsWith('https:')) {
    throw new Error('https_required');
  }
  return response;
};

export const filterFavoritesByAllowedHost = <T extends { boardUrl: string }>(items: T[] = []): T[] => {
  return items.filter(item => isAllowedBoardHost(item.boardUrl));
};

export const formatUnreadCount = (count: number) => (count > 99 ? '99+' : `${ count }`);

export const TRUSTED_HOSTS_KEY = 'trustedBoardHosts';

/** true = новые установки (нет ключа → скрыто); false/absent = апдейт (нет ключа → видно) */
export const CONTROLS_VISIBILITY_OPT_IN_KEY = 'controlsVisibilityOptIn';

export const isControlsVisibleForBoard = (
  map: Record<string, boolean> | undefined,
  boardId: string,
  optIn: boolean,
): boolean => {
  if (!boardId) return false;
  const value = map?.[boardId];
  return optIn ? value === true : value !== false;
};

export const normalizeBoardHost = (host?: string): string | null => {
  if (!host || typeof host !== 'string') return null;

  const raw = host.trim().toLowerCase();
  if (!raw) return null;

  let hostname = raw;
  const colonIdx = raw.lastIndexOf(':');
  if (colonIdx > -1 && /^\d+$/.test(raw.slice(colonIdx + 1))) {
    hostname = raw.slice(0, colonIdx);
  }

  return hostname || null;
};

export const isTrustedBoardHost = (host: string | undefined, trustedHosts: string[] = []): boolean => {
  const normalized = normalizeBoardHost(host);
  if (!normalized) return false;
  return trustedHosts.some(item => normalizeBoardHost(item) === normalized);
};

export const hostFromUrl = (url?: string): string | null => {
  if (!url) return null;
  try {
    return normalizeBoardHost(new URL(url).host);
  } catch (e) {
    return null;
  }
};
