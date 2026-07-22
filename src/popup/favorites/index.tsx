import { useEffect, useMemo, useState } from 'preact/hooks';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities, filterFavoritesByAllowedHost, isAllowedBoardHost, buildHttpsForumApiUrl, assertHttpsResponse } from '../../utils';
import { MaskIcon } from '../../components/MaskIcon';
import refreshIcon from '../../assets/icons/refresh-cw.svg';

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
    if (refreshing || info || error || !lastRefreshAt) return ' Обновить (не чаще раза в 1 мин.)';
    return `Обновлено: ${ new Date(lastRefreshAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) } · каждые ${ intervalMinutes } мин.`;
  }, [ lastRefreshAt, intervalMinutes, refreshing, info, error ]);

  const persist = async (items: IFavoriteTopic[]) => {
    const safeItems = filterFavoritesByAllowedHost(items);
    try {
      const result = await safeStorageSet({ [ STORAGE_KEY ]: safeItems });
      if (result.fallback) {
        setInfo('Память синхронизации переполнена. Избранное сохранено только в этом браузере.');
      }
    } catch (e) {
      setError('Не удалось сохранить избранное');
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
      setError('Не удалось обновить избранное');
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
        setError('Не удалось загрузить избранное');
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
      return;
    }
    setAdding(true);
    setError(null);

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
      setInfo('Тема добавлена в избранное');
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
    const confirmed = confirm(`Убрать «${ decodeEntities(item.topicName) }» из избранного?`);
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

    return (
      <li class={ `favoriteItem ${ stale ? 'stale' : '' }` } key={ item.id }>
        <label class="favoriteTurnToggle" title="Мой ход: следующим отвечаю я">
          <input
            type="checkbox"
            checked={ item.myTurn }
            onChange={ () => handleToggleMyTurn(item) }
          />
        </label>

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
                title="Есть новые сообщения. Нажмите, чтобы отметить прочитанным"
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
                  ? 'Вы не авторизованы на этом форуме — данные не обновляются'
                  : 'Форум недоступен — данные не обновляются'
                }
              >
                ⚠ не обновляется
              </span>
            ) }
          </div>
        </div>

        <button
          class="button small icon-only favoriteRemove"
          title="Убрать из избранного"
          onClick={ () => handleRemove(item) }
        >
          X
        </button>
      </li>
    );
  };

  return (
    <div class="favoritesTab">
      <div class="favoritesHeader">
        <div class="favoritesActions">
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
            class="button small"
            disabled={ !activeTopic || activeAlreadyAdded || adding }
            title={ !activeTopic
              ? 'Откройте страницу темы на форуме, чтобы добавить её'
              : (activeAlreadyAdded ? 'Эта тема уже в избранном' : 'Добавить открытую тему в избранное')
            }
            onClick={ handleAddActive }
          >
            { activeAlreadyAdded ? 'Уже в избранном' : '+ Текущая тема' }
          </button>
        </div>
      </div>

      <div class="favoritesStatus">
        { !loaded && <span class="text-secondary">Загружаем…</span> }
        { refreshing && <span class="text-secondary">Проверяем новые сообщения…</span> }
        { info && <span class="text-success">{ info }</span> }
        { error && <span class="text-error">{ error }</span> }
      </div>

      { loaded && !favorites.length && (
        <div class="emptyList">
          Пока пусто. Откройте тему на форуме и нажмите «+ Текущая тема».
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
