import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Sticker, FilePen, Ban, Bookmark, Calculator, Power } from 'lucide-react';

import { Stickers } from './stickers';
import { Templates } from './templates';
import { IgnoreList } from './ignoreList';
import { Favorites } from './favorites';
import showIcon from './assets/show.svg';
import hideIcon from './assets/hide.svg';
import settingsIcon from './assets/settings.svg';
import { isTrustedBoardHost, normalizeBoardHost, TRUSTED_HOSTS_KEY, hostFromUrl, isAllowedBoardHost } from '../utils';
import { safeStorageGet, safeStorageSet } from '../utils/storage';

import '../chota.min.css';
import '../common.css';
import './popup.css';

type TabId = 'stickers' | 'templates' | 'ignore' | 'favorites' | 'postCounter';

const FAVORITES_META_KEY = 'favoritesRefreshMeta';

const TAB_META: Record<Exclude<TabId, 'postCounter'>, { label: string; Icon: typeof Sticker }> = {
  stickers: { label: 'Стикеры', Icon: Sticker },
  templates: { label: 'Черновики', Icon: FilePen },
  ignore: { label: 'Игнор-лист', Icon: Ban },
  favorites: { label: 'Эпизоды', Icon: Bookmark },
};

const POST_COUNTER_TAB = { label: 'Счётчик постов', Icon: Calculator };

const formatUnreadCount = (count: number) => (count > 99 ? '99+' : `${ count }`);

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

export function App() {
  const [ activeTab, setActiveTab ] = useState<TabId>('stickers');
  const [ availability, setAvailability ] = useState<'unknown' | 'available' | 'blocked' | 'unavailable'>('unknown');
  const [ hasForum, setHasForum ] = useState(false);
  const [ boardId, setBoardId ] = useState<string | null>(null);
  const [ boardHost, setBoardHost ] = useState<string | null>(null);
  const [ controlsVisible, setControlsVisible ] = useState(false);
  const [ visibilityMap, setVisibilityMap ] = useState<Record<string, boolean>>({});
  const [ toggling, setToggling ] = useState(false);
  const [ isTrusted, setIsTrusted ] = useState(false);
  const [ forumPowerBusy, setForumPowerBusy ] = useState(false);
  const [ unreadCount, setUnreadCount ] = useState(0);

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
        chrome.storage.local.get([ 'controlsVisibilityByBoard' ]).catch(() => ({})),
      ]);

      const forumData = forumResp?.forumData;
      const board = forumData?.boardID ? `${ forumData.boardID }` : null;
      const host = normalizeBoardHost(
        forumData?.boardUrl
        || availabilityResp?.boardUrl
        || hostFromUrl(tabUrl),
      );
      setBoardId(board);
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
      setVisibilityMap(storedMap);
      if (board) {
        setControlsVisible(storedMap[board] === true);
      } else if (typeof availabilityResp?.visible === 'boolean') {
        setControlsVisible(availabilityResp.visible);
      }

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
    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes[FAVORITES_META_KEY]) return;
      const next = Number(changes[FAVORITES_META_KEY].newValue?.unreadCount) || 0;
      setUnreadCount(next);
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  const handleToggleControls = async () => {
    if (!boardId || availability !== 'available') return;
    const nextVisible = !controlsVisible;
    setControlsVisible(nextVisible);
    setToggling(true);
    try {
      const nextMap = { ...visibilityMap, [boardId]: nextVisible };
      setVisibilityMap(nextMap);
      await chrome.storage.local.set({ controlsVisibilityByBoard: nextMap });
      await sendMessageToActiveTab({
        type: 'tundra_toolkit_controls_toggle',
        boardID: boardId,
        visible: nextVisible,
      });
    } catch (e) {
      // ignore popup errors; user can retry
    } finally {
      setToggling(false);
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
        await sendMessageToActiveTab({
          type: 'tundra_toolkit_untrust_board',
          boardUrl: normalized || host,
        });
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
        // Дать content script поставить DOM-сигнал / открыть dialog до закрытия попапа
        window.setTimeout(() => window.close(), 50);
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
    if (tabId === 'ignore' && !hasForum) return;
    setActiveTab(tabId);
  };

  const controlsToggleLabel = controlsVisible ? 'Скрыть элементы' : 'Показать элементы';
  const toggleDisabled = availability !== 'available' || !boardId || toggling;
  const toggleIcon = controlsVisible ? hideIcon : showIcon;

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

  const renderTabButton = (tabId: Exclude<TabId, 'postCounter'>) => {
    const { label, Icon } = TAB_META[tabId];
    const showBadge = tabId === 'favorites' && unreadCount > 0;
    const forumOnly = tabId === 'ignore';
    const disabled = forumOnly && !hasForum;

    return (
      <button
        key={ tabId }
        class={ `button small tabButton ${ activeTab === tabId ? 'primary' : '' }` }
        onClick={ () => handleTabClick(tabId) }
        disabled={ disabled }
        title={ disabled ? 'Доступно только на форуме' : label }
        aria-label={ label }
      >
        <Icon size={ 16 } strokeWidth={ 2 } aria-hidden="true" />
        { showBadge && renderTabBadge() }
      </button>
    );
  };

  const { label: postCounterLabel, Icon: PostCounterIcon } = POST_COUNTER_TAB;

  return (
    <div class="popupWrapper">
      <div class="popupTabs">
        <div class="popupTabsMain">
          { (Object.keys(TAB_META) as Exclude<TabId, 'postCounter'>[]).map(renderTabButton) }
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
            <PostCounterIcon size={ 16 } strokeWidth={ 2 } aria-hidden="true" />
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
              <Power size={ 16 } strokeWidth={ 2 } aria-hidden="true" />
            </button>
          ) }
          <button
            class={ `button small controlsToggle ${ !controlsVisible ? 'muted' : '' }` }
            onClick={ handleToggleControls }
            disabled={ toggleDisabled }
            aria-label={ controlsToggleLabel }
            title={ availability !== 'available'
              ? 'Сначала включите расширение на форуме'
              : controlsToggleLabel
            }
          >
            <span class="controlsToggleContent">
              <img src={ toggleIcon } alt="" class="controlsToggleIcon" />
            </span>
          </button>
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
        { activeTab === 'stickers' && (
          <Stickers
            unreadCount={ unreadCount }
            onOpenFavorites={ () => setActiveTab('favorites') }
          />
        ) }
        { activeTab === 'ignore' && <IgnoreList /> }
        { activeTab === 'favorites' && <Favorites /> }
      </div>
    </div>
  );
}

render(<App />, document.getElementById('app'));
