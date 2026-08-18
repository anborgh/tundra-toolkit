import { useEffect, useMemo, useState } from 'preact/hooks';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities, filterFavoritesByAllowedHost, isAllowedBoardHost, buildHttpsForumApiUrl, assertHttpsResponse } from '../../utils';
import { MaskIcon } from '../../components/MaskIcon';
import refreshIcon from '../../assets/icons/refresh-cw.svg';
import plusIcon from '../../assets/icons/plus.svg';
import xIcon from '../../assets/icons/x.svg';
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import { usePopupToast } from '../popupToast';

import '../../components/icon.css';
import './style.css';

const STORAGE_KEY = 'favoriteTopics';
const META_KEY = 'favoritesRefreshMeta';

type BoardStatus = 'ok' | 'guest' | 'error';

type ActiveTopicContext = {
  boardUrl: string;
  topicID: string;
  topicName: string;
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

const getActiveTopic = async (): Promise<ActiveTopicContext | null> => {
  try {
    const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_forum_info' });
    const forumData = resp?.forumData;
    if (!forumData?.topicID || !forumData?.boardUrl) return null;
    if (!isAllowedBoardHost(forumData.boardUrl)) return null;
    return {
      boardUrl: `${ forumData.boardUrl }`,
      topicID: `${ forumData.topicID }`,
      topicName: forumData.topicName || `Тема ${ forumData.topicID }`,
    };
  } catch (e) {
    return null;
  }
};

const fetchApi = async (boardUrl: string, query: string): Promise<any> => {
  const url = buildHttpsForumApiUrl(boardUrl, query);
  const response = assertHttpsResponse(await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
  }));
  if (!response.ok) throw new Error(`http_${ response.status }`);
  const data = await response.json();
  if (data?.error) throw new Error(data.error?.message || 'api_error');
  return data?.response;
};

const formatLastPost = (unixSeconds?: number) => {
  if (!unixSeconds) return 'нет данных';
  const date = new Date(unixSeconds * 1000);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return `сегодня ${ date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }`;
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const pluralizeDays = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${ count } день назад`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${ count } дня назад`;
  return `${ count } дней назад`;
};

const daysAgoTitle = (unixSeconds?: number) => {
  if (!unixSeconds) return '';
  const posted = new Date(unixSeconds * 1000);
  const now = new Date();
  // считаем календарные дни, а не полные сутки
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(posted)) / 86400000);
  if (days <= 0) return 'Последний пост: сегодня';
  if (days === 1) return 'Последний пост: вчера';
  return `Последний пост: ${ pluralizeDays(days) }`;
};

const hasNewPosts = (item: IFavoriteTopic) => {
  if (!item.lastPostDate) return false;
  if (!item.lastSeenPostDate) return true;
  return item.lastPostDate > item.lastSeenPostDate;
};

const isStaleBoard = (boardUrl: string, boardStatuses: Record<string, BoardStatus>) => {
  const status = boardStatuses[boardUrl];
  return status === 'guest' || status === 'error';
};

export function Favorites() {
  const { showError, clearToast } = usePopupToast();
  const [ favorites, setFavorites ] = useState<IFavoriteTopic[]>([]);
  const [ loaded, setLoaded ] = useState(false);
  const [ refreshing, setRefreshing ] = useState(false);
  const [ boardStatuses, setBoardStatuses ] = useState<Record<string, BoardStatus>>({});
  const [ lastRefreshAt, setLastRefreshAt ] = useState<number | null>(null);
  const [ intervalMinutes, setIntervalMinutes ] = useState(2);
  const [ activeTopic, setActiveTopic ] = useState<ActiveTopicContext | null>(null);
  const [ adding, setAdding ] = useState(false);
  const [ error, setError ] = useState<string | null>(null);
  const [ info, setInfo ] = useState<string | null>(null);

  const refreshTitle = useMemo(() => {
    if (refreshing || info || error || !lastRefreshAt) return 'Обновить (не чаще чем раз в 1 мин.)';
    return `Обновлено: ${ new Date(lastRefreshAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) } · каждые ${ intervalMinutes } мин.`;
  }, [ lastRefreshAt, intervalMinutes, refreshing, info, error ]);

  const statusView = useMemo(() => {
    if (error) return null;
    if (info) {
      return { icon: circleCheckIcon, text: info, tone: 'success' as const, spin: false };
    }
    if (!loaded) {
      return { icon: loaderCircleIcon, text: 'Загружаем…', tone: 'muted' as const, spin: true };
    }
    if (refreshing) {
      return {
        icon: loaderCircleIcon,
        text: 'Проверяем новые ответы…',
        tone: 'muted' as const,
        spin: true,
      };
    }
    return null;
  }, [ error, info, loaded, refreshing ]);

  const persist = async (items: IFavoriteTopic[]) => {
    const safeItems = filterFavoritesByAllowedHost(items);
    try {
      const result = await safeStorageSet({ [ STORAGE_KEY ]: safeItems });
      if (result.fallback) {
        setInfo('В Chrome Sync не хватило места. Эпизоды остались только в этом браузере.');
      }
    } catch (e) {
      setError('Не удалось сохранить эпизоды');
      showError('Не удалось сохранить эпизоды');
    }
  };

  const loadFromStorage = async () => {
    const [ storage, metaStore ] = await Promise.all([
      safeStorageGet([ STORAGE_KEY ]),
      chrome.storage.local.get(META_KEY),
    ]);
    setFavorites(storage?.[ STORAGE_KEY ] || []);
    const meta = (metaStore as any)?.[ META_KEY ] || {};
    setBoardStatuses(meta.boardStatuses || {});
    setLastRefreshAt(meta.lastRefreshAt || null);
    setIntervalMinutes(Number(meta.intervalMinutes) || 2);
  };

  const requestRefresh = async (force = false, manual = false) => {
    setRefreshing(true);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'tundra_toolkit_favorites_refresh',
        force,
        manual,
      });
      await loadFromStorage();
      if (resp?.intervalMinutes) setIntervalMinutes(resp.intervalMinutes);
      if (manual && resp?.success && resp?.refreshed === false) {
        const mins = resp.manualIntervalMinutes || 1;
        setInfo(`Данные обновлялись меньше ${ mins } мин. назад`);
      }
    } catch (e) {
      setError('Не удалось обновить эпизоды');
      showError('Не удалось обновить эпизоды');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        await loadFromStorage();
        setLoaded(true);
        requestRefresh();
      } catch (e) {
        setError('Не удалось загрузить эпизоды');
        showError('Не удалось загрузить эпизоды');
        setLoaded(true);
      }
    };

    load();
    getActiveTopic().then(setActiveTopic);
  }, []);

  const activeAlreadyAdded = useMemo(() => {
    if (!activeTopic) return false;
    return favorites.some(item => item.boardUrl === activeTopic.boardUrl && item.topicID === activeTopic.topicID);
  }, [ activeTopic, favorites ]);

  const handleAddActive = async () => {
    if (!activeTopic || activeAlreadyAdded) return;
    if (!isAllowedBoardHost(activeTopic.boardUrl)) {
      setError('Некорректный адрес форума');
      showError('Некорректный адрес форума');
      return;
    }
    setAdding(true);
    setError(null);
    clearToast();

    try {
      let boardName = activeTopic.boardUrl;
      try {
        const boardResp = await fetchApi(activeTopic.boardUrl, 'method=board.get&fields=title');
        boardName = boardResp?.title || boardName;
      } catch (e) {
      }

      const newItem: IFavoriteTopic = {
        id: `${ activeTopic.boardUrl }:${ activeTopic.topicID }`,
        boardUrl: activeTopic.boardUrl,
        boardName,
        topicID: activeTopic.topicID,
        topicName: activeTopic.topicName,
        myTurn: false,
        lastSeenPostDate: Math.floor(Date.now() / 1000),
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };

      const next = [ ...favorites, newItem ];
      setFavorites(next);
      await persist(next);
      requestRefresh(true);
      setInfo('Тема добавлена в «Эпизоды»');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleMyTurn = async (item: IFavoriteTopic) => {
    const next = favorites.map(fav => fav.id === item.id
      ? { ...fav, myTurn: !fav.myTurn, updatedAt: Date.now() }
      : fav);
    setFavorites(next);
    await persist(next);
  };

  const handleRemove = async (item: IFavoriteTopic) => {
    const confirmed = confirm(`Убрать «${ decodeEntities(item.topicName) }» из списка эпизодов?`);
    if (!confirmed) return;

    const next = favorites.filter(fav => fav.id !== item.id);
    setFavorites(next);
    await persist(next);
  };

  const handleMarkSeen = async (item: IFavoriteTopic) => {
    const next = favorites.map(fav => fav.id === item.id
      ? {
        ...fav,
        lastSeenPostDate: fav.lastPostDate || Math.floor(Date.now() / 1000),
        seenNumReplies: fav.numReplies,
        updatedAt: Date.now(),
      }
      : fav);
    setFavorites(next);
    await persist(next);
  };

  const myTurnCount = useMemo(() => favorites.filter(item => item.myTurn).length, [ favorites ]);
  const totalCount = favorites.length;

  const { updatedItems, myTurnItems, restItems } = useMemo(() => {
    const updated = favorites
      .filter(item => hasNewPosts(item) && !isStaleBoard(item.boardUrl, boardStatuses))
      .sort((a, b) => (b.lastPostDate || 0) - (a.lastPostDate || 0));
    const updatedIds = new Set(updated.map(item => item.id));

    const myTurn = favorites
      .filter(item => item.myTurn && !updatedIds.has(item.id))
      .sort((a, b) => (a.lastPostDate || 0) - (b.lastPostDate || 0));
    const rest = favorites
      .filter(item => !item.myTurn && !updatedIds.has(item.id))
      .sort((a, b) => (b.lastPostDate || 0) - (a.lastPostDate || 0));
    return { updatedItems: updated, myTurnItems: myTurn, restItems: rest };
  }, [ favorites, boardStatuses ]);

  const renderItem = (item: IFavoriteTopic) => {
    const status = boardStatuses[item.boardUrl];
    const stale = status === 'guest' || status === 'error';
    const isNew = hasNewPosts(item);
    const topicUrl = `https://${ item.boardUrl }/viewtopic.php?id=${ item.topicID }&action=${isNew ? 'new' : 'last'}`;

    const turnLabel = item.myTurn
      ? 'Сейчас ваш ход. Нажмите, чтобы отметить: жду хода соигрока'
      : 'Ждёте хода соигрока. Нажмите, чтобы отметить: следующий ход мой';

    return (
      <li class={ `favoriteItem ${ stale ? 'stale' : '' } ${ item.myTurn ? 'is-myTurn' : '' }` } key={ item.id }>
        <button
          type="button"
          class="favoriteTurnCue"
          aria-pressed={ item.myTurn ? 'true' : 'false' }
          aria-label={ turnLabel }
          title={ turnLabel }
          onClick={ () => handleToggleMyTurn(item) }
        >
          <span class="favoriteTurnCueWick" aria-hidden="true" />
          <span class="favoriteTurnCueWord">{ item.myTurn ? 'ход' : 'жду' }</span>
        </button>

        <div class="favoriteBody">
          <div class="favoriteTitleRow">
            <a
              href={ topicUrl }
              target="_blank"
              rel="noreferrer"
              class="favoriteTitle"
              title={ decodeEntities(item.topicName) }
              onClick={ () => { if (isNew) handleMarkSeen(item); } }
            >
              { decodeEntities(item.topicName) }
            </a>
            { isNew && !stale && (
              <span
                class="favoriteNewBadge"
                role="button"
                tabIndex={ 0 }
                title="Есть новые ответы. Нажмите, чтобы отметить как просмотренные"
                onClick={ () => handleMarkSeen(item) }
              >
                new
              </span>
            ) }
          </div>
          <div class="favoriteMeta">
            <span class="favoriteBoard" title={ item.boardUrl }>{ decodeEntities(item.boardName) }</span>
            <span class="favoriteDot">·</span>
            <span title={ daysAgoTitle(item.lastPostDate) }>{ formatLastPost(item.lastPostDate) }</span>
            { item.lastUsername && (
              <>
                <span class="favoriteDot">·</span>
                <span class="favoriteLastUser" title="Автор последнего поста">
                  { decodeEntities(item.lastUsername) }
                </span>
              </>
            ) }
            { stale && (
              <span
                class="favoriteStaleBadge"
                title={ status === 'guest'
                  ? 'Вы вышли из аккаунта на этом форуме — тема не обновляется'
                  : 'Форум временно недоступен — тема не обновляется'
                }
              >
                ⚠ не обновляется
              </span>
            ) }
          </div>
        </div>

        <button
          class="button small icon-only favoriteRemove"
          title="Убрать из списка эпизодов"
          aria-label="Убрать из списка эпизодов"
          onClick={ () => handleRemove(item) }
        >
          <MaskIcon src={ xIcon } />
        </button>
      </li>
    );
  };

  return (
    <div class="favoritesTab">
      <div class="favoritesHeader">
        <div class="favoritesActions">
          { statusView && (
            <span
              class={ `favoritesStatus favoritesStatus--${ statusView.tone }` }
              title={ statusView.text }
              aria-label={ statusView.text }
              role="status"
            >
              <MaskIcon
                src={ statusView.icon }
                class={ statusView.spin ? 'ttIconSpin' : '' }
              />
            </span>
          ) }
          <button
            class="button small icon-only"
            disabled={ refreshing }
            title={refreshTitle}
            aria-label="Обновить"
            onClick={ () => requestRefresh(false, true) }
          >
            <MaskIcon src={ refreshIcon } />
          </button>
          <button
            class="button small primary"
            disabled={ !activeTopic || activeAlreadyAdded || adding }
            title={ !activeTopic
              ? 'Кнопка работает только на странице темы'
              : (activeAlreadyAdded ? 'Эта тема уже в избранном' : 'Добавить открытую тему в «Эпизоды»')
            }
            onClick={ handleAddActive }
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              { !activeAlreadyAdded && <MaskIcon src={ plusIcon } /> }
              { activeAlreadyAdded ? 'Уже в избранном' : 'Текущая тема' }
            </span>
          </button>
        </div>
      </div>

      { loaded && !favorites.length && (
        <div class="emptyList">
          Пока пусто. Откройте тему на форуме и нажмите «Текущая тема».
        </div>
      ) }

      { updatedItems.length > 0 && (
        <div class="favoritesSection favoritesSectionUpdated">
          <h5 class="favoritesSectionTitle">Обновлённые</h5>
          <ul class="favoritesList">
            { updatedItems.map(renderItem) }
          </ul>
        </div>
      ) }

      { favorites.length > 0 && (
        <div class="favoritesSection">
          <h5 class="favoritesSectionTitle">Мой ход { myTurnCount }/{ totalCount }</h5>
          { myTurnItems.length > 0 && (
            <ul class="favoritesList">
              { myTurnItems.map(renderItem) }
            </ul>
          ) }
        </div>
      ) }

      { restItems.length > 0 && (
        <div class="favoritesSection">
          { (myTurnCount > 0 || updatedItems.length > 0) && (
            <h5 class="favoritesSectionTitle">Жду ответа</h5>
          ) }
          <ul class="favoritesList">
            { restItems.map(renderItem) }
          </ul>
        </div>
      ) }
    </div>
  );
}
