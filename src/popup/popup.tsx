// Base styles first so component CSS (imported below) wins over chota's globals.
import '../chota.min.css';
import '../common.css';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Stickers } from './stickers';
import { Templates } from './templates';
import { IgnoreList } from './ignoreList';
import { Favorites } from './favorites';
import { StyleTab } from './style';
import settingsIcon from '../assets/icons/sliders.svg';
import mountainIcon from '../assets/icons/mountain.svg';
import infoIcon from '../assets/icons/info.svg';
import stickerIcon from '../assets/icons/sticker.svg';
import filePenIcon from '../assets/icons/file-pen.svg';
import banIcon from '../assets/icons/ban.svg';
import bookmarkIcon from '../assets/icons/bookmark.svg';
import calculatorIcon from '../assets/icons/calculator.svg';
import typeIcon from '../assets/icons/type.svg';
import { MaskIcon } from '../components/MaskIcon';
import { Ornament } from '../components/Ornament';
import {
  isTrustedBoardHost,
  normalizeBoardHost,
  TRUSTED_HOSTS_KEY,
  hostFromUrl,
  isAllowedBoardHost,
  CONTROLS_VISIBILITY_OPT_IN_KEY,
  isControlsVisibleForBoard,
  formatUnreadCount,
  buildHttpsForumApiUrl,
  assertHttpsResponse,
} from '../utils';
import { safeStorageGet, safeStorageSet } from '../utils/storage';
import { PopupToastBar, PopupToastProvider, usePopupToast } from './popupToast';
import { ConfirmDialogProvider } from '../components/ConfirmDialog';

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
  ignore: { label: 'Игнор', icon: banIcon },
  favorites: { label: 'Эпизоды', icon: bookmarkIcon },
  style: { label: 'Стиль', icon: typeIcon },
};

const POST_COUNTER_TAB = { label: 'Счётчик', icon: calculatorIcon };
const BOARD_NAMES_KEY = 'boardNamesByHost';

const loadBoardName = async (host: string, allowFetch: boolean): Promise<string | null> => {
  try {
    const store = await chrome.storage.local.get(BOARD_NAMES_KEY);
    const map: Record<string, string> = (store as any)?.[BOARD_NAMES_KEY] || {};
    if (map[host]) return map[host];
    if (!allowFetch) return null;

    const response = assertHttpsResponse(await fetch(
      buildHttpsForumApiUrl(host, 'method=board.get&fields=title'),
      { credentials: 'include', redirect: 'follow' },
    ));
    if (!response.ok) return null;
    const data = await response.json();
    const title = typeof data?.response?.title === 'string' ? data.response.title.trim().slice(0, 120) : '';
    if (!title) return null;
    await chrome.storage.local.set({ [ BOARD_NAMES_KEY ]: { ...map, [ host ]: title } });
    return title;
  } catch (e) {
    return null;
  }
};

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
  const { showError, clearToast } = usePopupToast();
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
  const [ boardName, setBoardName ] = useState<string | null>(null);
  const [ tabHost, setTabHost ] = useState<string | null>(null);

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
      setTabHost(hostFromUrl(tabUrl) || null);
      setBoardId(board);
      setForumId(forum);
      setBoardHost(host);

      const forumDetected = Boolean(availabilityResp?.hasForum);
      const computedAvailable = Boolean(availabilityResp?.available);
      const isTrusted = Boolean(availabilityResp?.isTrusted);
      const canTrust = Boolean(host && isAllowedBoardHost(host) && forumDetected);

      setHasForum(forumDetected);
      if (host && forumDetected && isAllowedBoardHost(host)) {
        loadBoardName(host, isTrusted).then(setBoardName);
      } else {
        setBoardName(null);
      }
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
      showError('Не удалось получить данные страницы');
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
      clearToast();
      setActiveTab('stickers');
    }
  }, [ activeTab, availability, hasForum ]);

  useEffect(() => {
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[FAVORITES_META_KEY]) {
        const next = Number(changes[FAVORITES_META_KEY].newValue?.unreadCount) || 0;
        setUnreadCount(next);
      }
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
      showError('Не удалось переключить кнопки на странице');
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
      showError('Не удалось переключить SFW-стиль');
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
      showError('Не удалось сохранить настройки стиля');
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
      showError('Не удалось переключить Tundra Toolkit на этом форуме');
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
      showError('Не удалось открыть счётчик постов');
    }
  };

  const handleTabClick = (tabId: TabId) => {
    if (tabId === 'postCounter') {
      openPostCounter();
      return;
    }
    if (tabId === 'ignore' && (!hasForum || availability !== 'available')) return;
    if (tabId !== activeTab) clearToast();
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

  const forumOnlyDisabled = !hasForum || availability !== 'available';
  const forumOnlyTitle = !hasForum
    ? 'Доступно только на форуме MyBB/RusFF'
    : 'Сначала включите Tundra Toolkit на этом форуме';

  const renderTabButton = (tabId: ContentTabId) => {
    const { label, icon } = TAB_META[tabId];
    const showBadge = tabId === 'favorites' && unreadCount > 0;
    const forumOnly = tabId === 'ignore' || tabId === 'style';
    const disabled = forumOnly && forumOnlyDisabled;

    return (
      <button
        key={ tabId }
        class="popupTab"
        type="button"
        onClick={ () => handleTabClick(tabId) }
        disabled={ disabled }
        title={ disabled ? forumOnlyTitle : undefined }
        aria-current={ activeTab === tabId ? 'page' : undefined }
      >
        <MaskIcon src={ icon } />
        <span class="popupTabLabel">{ label }</span>
        { showBadge && renderTabBadge() }
      </button>
    );
  };

  const { label: postCounterLabel, icon: postCounterIcon } = POST_COUNTER_TAB;
  const canTrustHere = hasForum && !!boardHost;
  const showEnableBanner = canTrustHere && !isTrusted && availability !== 'unknown';
  const enableBanner = showEnableBanner ? {
    host: boardHost || '',
    busy: forumPowerBusy,
    onEnable: handleToggleForumPower,
  } : null;

  return (
    <div class="popupWrapper">
      <h1 class="sr-only" translate={ false }>Tundra Toolkit</h1>
      <header class="popupHeader">
        <div class={ `popupLogo ${ hasForum && !isTrusted ? 'is-muted' : '' }` } aria-hidden="true">
          <MaskIcon src={ mountainIcon } />
        </div>
        <div class="popupHeaderMeta">
          { hasForum ? (
            <>
              <div class="popupHeaderTitle" title={ boardName || boardHost || undefined }>
                { boardName || boardHost || 'Форум' }
              </div>
              <div class="popupHeaderSub">{ boardHost }</div>
            </>
          ) : (
            <>
              <div class="popupHeaderTitle ttDisplay" translate={ false }>Tundra Toolkit</div>
              <div class="popupHeaderSub" title={ tabHost || undefined }>
                { availability === 'unknown'
                  ? 'Проверяем страницу…'
                  : tabHost
                    ? `${ tabHost } — это не форум MyBB/RusFF`
                    : 'Эта страница — не форум MyBB/RusFF' }
              </div>
            </>
          ) }
        </div>
        { hasForum && (
          <label
            class="popupPower"
            title={ isTrusted ? 'Выключить Tundra Toolkit на этом форуме' : 'Включить Tundra Toolkit на этом форуме' }
          >
            <span class="popupPowerLabel">{ isTrusted ? 'Включено' : 'Выключено' }</span>
            <span class="ttSwitch onDark">
              <input
                type="checkbox"
                checked={ isTrusted }
                disabled={ forumPowerBusy || !boardHost }
                onChange={ handleToggleForumPower }
                aria-label="Tundra Toolkit на этом форуме"
              />
              <span aria-hidden="true" />
            </span>
          </label>
        ) }
        <button
          type="button"
          class="popupHeaderButton"
          onClick={ handleOpenOptions }
          title="Настройки"
          aria-label="Настройки"
        >
          <MaskIcon src={ settingsIcon } />
        </button>
      </header>
      <Ornament size={ 10 } class="popupOrnament" />

      <nav class="popupTabs" aria-label="Разделы">
        { (Object.keys(TAB_META) as ContentTabId[]).map(renderTabButton) }
        <button
          type="button"
          class="popupTab popupTabAction"
          onClick={ () => handleTabClick('postCounter') }
          disabled={ forumOnlyDisabled }
          title={ forumOnlyDisabled ? forumOnlyTitle : 'Откроется окном на странице форума' }
        >
          <MaskIcon src={ postCounterIcon } />
          <span class="popupTabLabel">{ postCounterLabel }</span>
        </button>
      </nav>

      <main class="popupTabContent">
        { !hasForum && availability !== 'unknown' && activeTab === 'favorites' && (
          <div class="popupNotice">
            <MaskIcon src={ infoIcon } />
            <span>Эпизоды, стикеры и черновики работают везде. Игнор, стиль и счётчик постов — только на форумах MyBB/RusFF.</span>
          </div>
        ) }
        { activeTab === 'templates' && <Templates enableBanner={ enableBanner } /> }
        { activeTab === 'stickers' && <Stickers enableBanner={ enableBanner } /> }
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
      </main>
      <PopupToastBar />
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(
    <ConfirmDialogProvider>
      <PopupToastProvider>
        <App />
      </PopupToastProvider>
    </ConfirmDialogProvider>,
    root,
  );
}
