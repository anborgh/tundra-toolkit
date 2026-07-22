import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Stickers } from './stickers';
import { Templates } from './templates';
import { IgnoreList } from './ignoreList';
import { Favorites } from './favorites';
import { StyleTab } from './style';
import settingsIcon from './assets/settings.svg';
import stickerIcon from '../assets/icons/sticker.svg';
import filePenIcon from '../assets/icons/file-pen.svg';
import banIcon from '../assets/icons/ban.svg';
import bookmarkIcon from '../assets/icons/bookmark.svg';
import calculatorIcon from '../assets/icons/calculator.svg';
import powerIcon from '../assets/icons/power.svg';
import paintBucketIcon from '../assets/icons/paint-bucket.svg';
import { MaskIcon } from '../components/MaskIcon';
import {
  isTrustedBoardHost,
  normalizeBoardHost,
  TRUSTED_HOSTS_KEY,
  hostFromUrl,
  isAllowedBoardHost,
  CONTROLS_VISIBILITY_OPT_IN_KEY,
  isControlsVisibleForBoard,
  formatUnreadCount,
} from '../utils';
import { safeStorageGet, safeStorageSet } from '../utils/storage';

import '../chota.min.css';
import '../common.css';
import '../components/icon.css';
import './popup.css';

type TabId = 'stickers' | 'templates' | 'ignore' | 'favorites' | 'style' | 'postCounter';
type ContentTabId = Exclude<TabId, 'postCounter'>;
type PostAppearanceSettings = {
  fontScale: number;
  firstLineIndent: boolean;
  paragraphSpacing: number | null;
};
type StoredPostAppearanceSettings = Omit<PostAppearanceSettings, 'firstLineIndent'> & {
  firstLineIndentByForum?: Record<string, boolean>;
};

const FAVORITES_META_KEY = 'favoritesRefreshMeta';
const STYLE_OVERRIDE_KEY = 'styleOverrideByHost';
const POST_APPEARANCE_KEY = 'postAppearanceByHost';
const ACTIVE_TAB_KEY = 'popupActiveTab';
const DEFAULT_POST_APPEARANCE: PostAppearanceSettings = {
  fontScale: 100,
  firstLineIndent: false,
  paragraphSpacing: null,
};

const TAB_META: Record<ContentTabId, { label: string; icon: string }> = {
  stickers: { label: 'Стикеры', icon: stickerIcon },
  templates: { label: 'Черновики', icon: filePenIcon },
  ignore: { label: 'Игнор-лист', icon: banIcon },
  favorites: { label: 'Эпизоды', icon: bookmarkIcon },
  style: { label: 'Стиль', icon: paintBucketIcon },
};

const POST_COUNTER_TAB = { label: 'Счётчик постов', icon: calculatorIcon };

const sendMessageToActiveTab = (message: any) => new Promise<any>((resolve, reject) => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      reject(new Error('active_tab_not_found'));
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(response);
    });
  });
});

const hasValidBoardId = (value?: string | null) => {
  if (!value) return false;
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
};

const controlsScopeKey = (boardId?: string | null, boardHost?: string | null) => {
  if (hasValidBoardId(boardId)) return `${ boardId }`;
  if (boardHost) return `host:${ boardHost }`;
  return null;
};

export function App() {
  const [ activeTab, setActiveTab ] = useState<ContentTabId>('stickers');
  const [ availability, setAvailability ] = useState<'unknown' | 'available' | 'blocked' | 'unavailable'>('unknown');
  const [ hasForum, setHasForum ] = useState(false);
  const [ boardId, setBoardId ] = useState<string | null>(null);
  const [ forumId, setForumId ] = useState<string | null>(null);
  const [ boardHost, setBoardHost ] = useState<string | null>(null);
  const [ controlsVisible, setControlsVisible ] = useState(false);
  const [ visibilityMap, setVisibilityMap ] = useState<Record<string, boolean>>({});
  const [ toggling, setToggling ] = useState(false);
  const [ isTrusted, setIsTrusted ] = useState(false);
  const [ forumPowerBusy, setForumPowerBusy ] = useState(false);
  const [ unreadCount, setUnreadCount ] = useState(0);
  const [ styleOverrideEnabled, setStyleOverrideEnabled ] = useState(false);
  const [ styleOverrideMap, setStyleOverrideMap ] = useState<Record<string, boolean>>({});
  const [ styleToggling, setStyleToggling ] = useState(false);
  const [ postAppearance, setPostAppearance ] = useState<PostAppearanceSettings>(DEFAULT_POST_APPEARANCE);
  const [ postAppearanceMap, setPostAppearanceMap ] = useState<Record<string, StoredPostAppearanceSettings>>({});
  const [ postAppearanceToggling, setPostAppearanceToggling ] = useState(false);

  const loadUnreadCount = async () => {
    try {
      const metaStore = await chrome.storage.local.get(FAVORITES_META_KEY);
      const count = Number((metaStore as any)?.[FAVORITES_META_KEY]?.unreadCount) || 0;
      setUnreadCount(count);
    } catch (e) {
      setUnreadCount(0);
    }
  };

  const loadContext = async () => {
    try {
      const [ tab ] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabUrl = tab?.url;

      const [ availabilityResp, forumResp, storage ] = await Promise.all([
        sendMessageToActiveTab({ type: 'tundra_toolkit_availability_ping' }).catch(() => null),
        sendMessageToActiveTab({ type: 'tundra_toolkit_forum_info' }).catch(() => null),
        chrome.storage.local.get([
          'controlsVisibilityByBoard',
          CONTROLS_VISIBILITY_OPT_IN_KEY,
          STYLE_OVERRIDE_KEY,
          POST_APPEARANCE_KEY,
        ]).catch(() => ({})),
      ]);

      const forumData = forumResp?.forumData;
      const board = forumData?.boardID ? `${ forumData.boardID }` : null;
      const forum = forumData?.forumID ? `${ forumData.forumID }` : null;
      const host = normalizeBoardHost(
        forumData?.boardUrl
        || availabilityResp?.boardUrl
        || hostFromUrl(tabUrl),
      );
      setBoardId(board);
      setForumId(forum);
      setBoardHost(host);

      const forumDetected = Boolean(availabilityResp?.hasForum);
      const computedAvailable = Boolean(availabilityResp?.available);
      const isTrusted = Boolean(availabilityResp?.isTrusted);
      const canTrust = Boolean(host && isAllowedBoardHost(host) && forumDetected);

      setHasForum(forumDetected);
      setIsTrusted(isTrusted);
      setAvailability(
        computedAvailable
          ? 'available'
          : canTrust
            ? 'blocked'
            : 'unavailable',
      );

      const storedMap: Record<string, boolean> = ((storage as any)?.controlsVisibilityByBoard as Record<string, boolean> | undefined) || {};
      const optIn = (storage as any)?.[CONTROLS_VISIBILITY_OPT_IN_KEY] === true;
      const scopeKey = controlsScopeKey(board, host);
      setVisibilityMap(storedMap);
      if (hasValidBoardId(board)) {
        setControlsVisible(isControlsVisibleForBoard(storedMap, `${ board }`, optIn));
      } else if (scopeKey && Object.prototype.hasOwnProperty.call(storedMap, scopeKey)) {
        setControlsVisible(storedMap[scopeKey] !== false);
      } else if (typeof availabilityResp?.visible === 'boolean') {
        setControlsVisible(availabilityResp.visible);
      } else {
        setControlsVisible(true);
      }

      const storedStyleMap: Record<string, boolean> = ((storage as any)?.[STYLE_OVERRIDE_KEY] as Record<string, boolean> | undefined) || {};
      setStyleOverrideMap(storedStyleMap);
      if (host && Object.prototype.hasOwnProperty.call(storedStyleMap, host)) {
        setStyleOverrideEnabled(storedStyleMap[host] === true);
      } else if (typeof availabilityResp?.styleOverrideEnabled === 'boolean') {
        setStyleOverrideEnabled(availabilityResp.styleOverrideEnabled);
      } else {
        setStyleOverrideEnabled(false);
      }

      const storedAppearanceMap = ((storage as any)?.[POST_APPEARANCE_KEY] as Record<string, StoredPostAppearanceSettings> | undefined) || {};
      const storedAppearance = host ? storedAppearanceMap[host] : null;
      setPostAppearanceMap(storedAppearanceMap);
      setPostAppearance({
        fontScale: typeof storedAppearance?.fontScale === 'number'
          ? Math.min(140, Math.max(80, storedAppearance.fontScale))
          : DEFAULT_POST_APPEARANCE.fontScale,
        firstLineIndent: Boolean(forum && storedAppearance?.firstLineIndentByForum?.[forum] === true),
        paragraphSpacing: typeof storedAppearance?.paragraphSpacing === 'number'
          ? Math.min(2, Math.max(0, storedAppearance.paragraphSpacing))
          : DEFAULT_POST_APPEARANCE.paragraphSpacing,
      });

      await loadUnreadCount();
    } catch (e) {
      setAvailability('unavailable');
      setHasForum(false);
    }
  };

  useEffect(() => {
    loadContext();
    const retryTimer = window.setTimeout(() => loadContext(), 300);
    return () => window.clearTimeout(retryTimer);
  }, []);

  useEffect(() => {
    chrome.storage.local.get(ACTIVE_TAB_KEY)
      .then((storage) => {
        const storedTab = storage?.[ACTIVE_TAB_KEY];
        if (storedTab && Object.prototype.hasOwnProperty.call(TAB_META, storedTab)) {
          setActiveTab(storedTab as ContentTabId);
        }
      })
      .catch(() => {
        // Keep the default tab if storage is unavailable.
      });
  }, []);

  useEffect(() => {
    if (
      (activeTab === 'ignore' || activeTab === 'style')
      && availability !== 'unknown'
      && (!hasForum || availability !== 'available')
    ) {
      setActiveTab('stickers');
    }
  }, [ activeTab, availability, hasForum ]);

  useEffect(() => {
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[FAVORITES_META_KEY]) return;
      const next = Number(changes[FAVORITES_META_KEY].newValue?.unreadCount) || 0;
      setUnreadCount(next);
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  const handleToggleControls = async () => {
    if (availability !== 'available') return;
    const nextVisible = !controlsVisible;
    const scopeKey = controlsScopeKey(boardId, boardHost);
    setControlsVisible(nextVisible);
    setToggling(true);
    try {
      if (scopeKey) {
        const nextMap = { ...visibilityMap, [scopeKey]: nextVisible };
        setVisibilityMap(nextMap);
        await chrome.storage.local.set({ controlsVisibilityByBoard: nextMap });
      }
      await sendMessageToActiveTab({
        type: 'tundra_toolkit_controls_toggle',
        boardID: boardId,
        boardUrl: boardHost,
        visible: nextVisible,
      });
    } catch (e) {
      // ignore popup errors; user can retry
    } finally {
      setToggling(false);
    }
  };

  const handleToggleStyleOverride = async () => {
    if (availability !== 'available' || !boardHost) return;
    const nextEnabled = !styleOverrideEnabled;
    setStyleOverrideEnabled(nextEnabled);
    setStyleToggling(true);
    try {
      const nextMap = { ...styleOverrideMap, [boardHost]: nextEnabled };
      setStyleOverrideMap(nextMap);
      await chrome.storage.local.set({ [STYLE_OVERRIDE_KEY]: nextMap });
      await sendMessageToActiveTab({
        type: 'tundra_toolkit_style_override_toggle',
        boardUrl: boardHost,
        enabled: nextEnabled,
      });
    } catch (e) {
      // ignore popup errors; user can retry
    } finally {
      setStyleToggling(false);
    }
  };

  const handlePostAppearanceChange = async (settings: PostAppearanceSettings) => {
    if (availability !== 'available' || !boardHost) return;
    const nextSettings = {
      fontScale: Math.min(140, Math.max(80, settings.fontScale)),
      firstLineIndent: settings.firstLineIndent === true,
      paragraphSpacing: typeof settings.paragraphSpacing === 'number'
        ? Math.min(2, Math.max(0, Math.round(settings.paragraphSpacing * 4) / 4))
        : null,
    };
    const storedSettings: StoredPostAppearanceSettings = postAppearanceMap[boardHost] || {
      fontScale: DEFAULT_POST_APPEARANCE.fontScale,
      paragraphSpacing: DEFAULT_POST_APPEARANCE.paragraphSpacing,
    };
    const nextStoredSettings: StoredPostAppearanceSettings = {
      fontScale: nextSettings.fontScale,
      paragraphSpacing: nextSettings.paragraphSpacing,
      firstLineIndentByForum: forumId
        ? {
          ...storedSettings.firstLineIndentByForum,
          [forumId]: nextSettings.firstLineIndent,
        }
        : storedSettings.firstLineIndentByForum,
    };
    const nextMap = { ...postAppearanceMap, [boardHost]: nextStoredSettings };
    setPostAppearance(nextSettings);
    setPostAppearanceMap(nextMap);
    setPostAppearanceToggling(true);
    try {
      await chrome.storage.local.set({ [POST_APPEARANCE_KEY]: nextMap });
      await sendMessageToActiveTab({
        type: 'tundra_toolkit_post_appearance_update',
        boardUrl: boardHost,
        forumID: forumId,
        settings: nextSettings,
      });
    } catch (e) {
      // Keep the optimistic state; the user can retry.
    } finally {
      setPostAppearanceToggling(false);
    }
  };

  const handleToggleForumPower = async () => {
    const host = boardHost || hostFromUrl((await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url);
    if (!host || !hasForum) return;

    setForumPowerBusy(true);
    try {
      const storage = await safeStorageGet([ TRUSTED_HOSTS_KEY ]);
      const trustedHosts: string[] = storage?.[TRUSTED_HOSTS_KEY] || [];
      const normalized = normalizeBoardHost(host);

      if (isTrusted) {
        const nextHosts = trustedHosts.filter(item => normalizeBoardHost(item) !== normalized);
        await safeStorageSet({ [TRUSTED_HOSTS_KEY]: nextHosts });

        if (normalized && styleOverrideMap[normalized]) {
          const nextStyleMap = { ...styleOverrideMap, [normalized]: false };
          setStyleOverrideMap(nextStyleMap);
          setStyleOverrideEnabled(false);
          await chrome.storage.local.set({ [STYLE_OVERRIDE_KEY]: nextStyleMap });
        }

        const resp = await sendMessageToActiveTab({
          type: 'tundra_toolkit_untrust_board',
          boardUrl: normalized || host,
        });
        if (resp?.reload) {
          window.close();
          return;
        }
      } else if (normalized && !isTrustedBoardHost(normalized, trustedHosts)) {
        await safeStorageSet({
          [TRUSTED_HOSTS_KEY]: [ ...trustedHosts, normalized ],
        });
        await sendMessageToActiveTab({
          type: 'tundra_toolkit_trust_board',
          boardUrl: normalized || host,
        });
      }

      await loadContext();
    } catch (e) {
      // user can retry
    } finally {
      setForumPowerBusy(false);
    }
  };

  const openPostCounter = async () => {
    if (!hasForum || availability !== 'available') return;

    try {
      const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_open_post_counter' });
      if (resp?.success) {
        window.setTimeout(() => window.close(), 150);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleTabClick = (tabId: TabId) => {
    if (tabId === 'postCounter') {
      openPostCounter();
      return;
    }
    if (tabId === 'ignore' && (!hasForum || availability !== 'available')) return;
    setActiveTab(tabId);
    chrome.storage.local.set({ [ACTIVE_TAB_KEY]: tabId }).catch(() => {
      // The selected tab still works for the current popup instance.
    });
  };

  const handleOpenOptions = () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  };

  const renderTabBadge = () => {
    if (!unreadCount) return null;
    return (
      <span class="tabBadge" aria-label={ `Обновлений: ${ unreadCount }` }>
        { formatUnreadCount(unreadCount) }
      </span>
    );
  };

  const renderTabButton = (tabId: ContentTabId) => {
    const { label, icon } = TAB_META[tabId];
    const showBadge = tabId === 'favorites' && unreadCount > 0;
    const forumOnly = tabId === 'ignore' || tabId === 'style';
    const disabled = forumOnly && (!hasForum || availability !== 'available');
    const disabledTitle = !hasForum
      ? 'Доступно только на форуме'
      : 'Сначала включите расширение на форуме';

    return (
      <button
        key={ tabId }
        class={ `button small tabButton ${ activeTab === tabId ? 'primary' : '' }` }
        onClick={ () => handleTabClick(tabId) }
        disabled={ disabled }
        title={ disabled ? disabledTitle : label }
        aria-label={ label }
      >
        <MaskIcon src={ icon } />
        { showBadge && renderTabBadge() }
      </button>
    );
  };

  const { label: postCounterLabel, icon: postCounterIcon } = POST_COUNTER_TAB;

  return (
    <div class="popupWrapper">
      <div class="popupTabs">
        <div class="popupTabsMain">
          { (Object.keys(TAB_META) as ContentTabId[]).map(renderTabButton) }
          <button
            class="button small tabButton"
            onClick={ () => handleTabClick('postCounter') }
            disabled={ !hasForum || availability !== 'available' }
            title={ !hasForum
              ? 'Доступно только на форуме'
              : availability !== 'available'
                ? 'Сначала включите расширение на форуме'
                : postCounterLabel
            }
            aria-label={ postCounterLabel }
          >
            <MaskIcon src={ postCounterIcon } />
          </button>
        </div>

        <div class="popupTabsActions">
          { hasForum && (
            <button
              class={ `button small tabButton forumPowerToggle ${ isTrusted ? 'active' : 'muted' }` }
              onClick={ handleToggleForumPower }
              disabled={ forumPowerBusy || !boardHost }
              title={ isTrusted ? 'Выключить на этом форуме' : 'Включить на этом форуме' }
              aria-label={ isTrusted ? 'Выключить на форуме' : 'Включить на форуме' }
              aria-pressed={ isTrusted }
            >
              <MaskIcon src={ powerIcon } />
            </button>
          ) }
          <button
            class="button small controlsSettings"
            onClick={ handleOpenOptions }
            title="Настройки"
            aria-label="Настройки"
          >
            <span class="controlsSettingsContent">
              <img src={ settingsIcon } alt="" class="controlsSettingsIcon" />
            </span>
          </button>
        </div>
      </div>

      <div class="popupTabContent">
        { activeTab === 'templates' && <Templates /> }
        { activeTab === 'stickers' && <Stickers /> }
        { activeTab === 'ignore' && (
          <IgnoreList
            controlsVisible={ controlsVisible }
            controlsToggling={ toggling }
            onToggleControls={ handleToggleControls }
          />
        ) }
        { activeTab === 'favorites' && <Favorites /> }
        { activeTab === 'style' && (
          <StyleTab
            available={ availability === 'available' && hasForum }
            sfwEnabled={ styleOverrideEnabled }
            sfwBusy={ styleToggling }
            fontScale={ postAppearance.fontScale }
            firstLineIndent={ postAppearance.firstLineIndent }
            paragraphSpacing={ postAppearance.paragraphSpacing }
            sectionAvailable={ Boolean(forumId) }
            appearanceBusy={ postAppearanceToggling }
            onToggleSfw={ handleToggleStyleOverride }
            onFontScaleChange={ fontScale => handlePostAppearanceChange({ ...postAppearance, fontScale }) }
            onToggleFirstLineIndent={ () => handlePostAppearanceChange({
              ...postAppearance,
              firstLineIndent: !postAppearance.firstLineIndent,
            }) }
            onParagraphSpacingChange={ paragraphSpacing => handlePostAppearanceChange({
              ...postAppearance,
              paragraphSpacing,
            }) }
          />
        ) }
      </div>
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
