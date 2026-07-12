import { useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities, filterFavoritesByAllowedHost } from '../../utils';
import { MaskIcon } from '../../components/MaskIcon';
import refreshIcon from '../../assets/icons/refresh-cw.svg';

import '../../components/icon.css';
import './style.css';

const STORAGE_KEY = 'favoriteTopics';
const META_KEY = 'favoritesRefreshMeta';
const VIEW_MODE_KEY = 'favoritesViewMode';

type BoardStatus = 'ok' | 'guest' | 'error';
type ViewMode = 'byForum' | 'byDate';

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

const hasNewPosts = (item: IFavoriteTopic) => {
  if (!item.lastPostDate) return false;
  if (!item.lastSeenPostDate) return true;
  return item.lastPostDate > item.lastSeenPostDate;
};

const byLastPostDesc = (a: IFavoriteTopic, b: IFavoriteTopic) =>
  (b.lastPostDate || 0) - (a.lastPostDate || 0);

export function FavoritesOptions() {
  const [ favorites, setFavorites ] = useState<IFavoriteTopic[]>([]);
  const [ boardStatuses, setBoardStatuses ] = useState<Record<string, BoardStatus>>({});
  const [ lastRefreshAt, setLastRefreshAt ] = useState<number | null>(null);
  const [ intervalMinutes, setIntervalMinutes ] = useState(2);
  const [ refreshing, setRefreshing ] = useState(false);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ info, setInfo ] = useState<string | null>(null);
  const [ viewMode, setViewMode ] = useState<ViewMode>('byForum');

  const loadFromStorage = async () => {
    const [ storage, metaStore, viewStore ] = await Promise.all([
      safeStorageGet([ STORAGE_KEY ]),
      chrome.storage.local.get(META_KEY),
      chrome.storage.local.get(VIEW_MODE_KEY),
    ]);
    setFavorites(storage?.[ STORAGE_KEY ] || []);
    const meta = (metaStore as any)?.[ META_KEY ] || {};
    setBoardStatuses(meta.boardStatuses || {});
    setLastRefreshAt(meta.lastRefreshAt || null);
    setIntervalMinutes(Number(meta.intervalMinutes) || 2);
    const savedView = (viewStore as any)?.[ VIEW_MODE_KEY ];
    if (savedView === 'byForum' || savedView === 'byDate') {
      setViewMode(savedView);
    }
  };

  const handleViewModeChange = async (mode: ViewMode) => {
    setViewMode(mode);
    await chrome.storage.local.set({ [ VIEW_MODE_KEY ]: mode });
  };

  const persist = async (items: IFavoriteTopic[]) => {
    const safeItems = filterFavoritesByAllowedHost(items);
    const result = await safeStorageSet({ [ STORAGE_KEY ]: safeItems });
    if (result.fallback) {
      setWarning('Память синхронизации переполнена. Избранное сохранено только в этом браузере.');
    } else {
      setWarning(null);
    }
  };

  const requestRefresh = async (manual = false) => {
    setRefreshing(true);
    setError(null);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'tundra_toolkit_favorites_refresh',
        force: false,
        manual,
      });
      await loadFromStorage();
      if (resp?.intervalMinutes) setIntervalMinutes(resp.intervalMinutes);
      if (manual && resp?.success && resp?.refreshed === false) {
        const mins = resp.manualIntervalMinutes || 1;
        setInfo(`Данные обновлялись меньше ${ mins } мин. назад`);
      } else if (manual) {
        setInfo('Список обновлён');
      }
    } catch (e) {
      setError('Не удалось обновить избранное');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFromStorage().then(() => requestRefresh());
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { boardName: string; boardUrl: string; items: IFavoriteTopic[] }>();
    favorites.forEach(item => {
      if (!map.has(item.boardUrl)) {
        map.set(item.boardUrl, {
          boardName: item.boardName,
          boardUrl: item.boardUrl,
          items: [],
        });
      }
      map.get(item.boardUrl)!.items.push(item);
    });

    return Array.from(map.values()).map(group => ({
      ...group,
      items: [ ...group.items ].sort(byLastPostDesc),
    }));
  }, [ favorites ]);

  const sortedByDate = useMemo(
    () => [ ...favorites ].sort(byLastPostDesc),
    [ favorites ],
  );

  const myTurnCount = useMemo(() => favorites.filter(item => item.myTurn).length, [ favorites ]);
  const totalCount = favorites.length;

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

  const renderItem = (item: IFavoriteTopic, showBoard: boolean) => {
    const status = boardStatuses[item.boardUrl];
    const stale = status === 'guest' || status === 'error';
    const isNew = hasNewPosts(item);

    return (
      <li className={ `favoritesOptionsItem ${ stale ? 'stale' : '' }` } key={ item.id }>
        <label className="favoritesOptionsTurn" title="Мой ход: следующим отвечаю я">
          <input
            type="checkbox"
            checked={ item.myTurn }
            onChange={ () => handleToggleMyTurn(item) }
          />
        </label>

        <div className="favoritesOptionsBody">
          <div className="favoritesOptionsTitleRow">
            <a
              href={ `https://${ item.boardUrl }/viewtopic.php?id=${ item.topicID }` }
              target="_blank"
              rel="noopener noreferrer"
              onClick={ () => { if (isNew) handleMarkSeen(item); } }
            >
              { decodeEntities(item.topicName) }
            </a>
            { isNew && !stale && (
              <button
                className="favoritesOptionsNewBadge"
                title="Есть новые сообщения. Нажмите, чтобы отметить прочитанным"
                onClick={ () => handleMarkSeen(item) }
              >
                new
              </button>
            ) }
          </div>
          <div className="favoritesOptionsMeta text-secondary">
            { showBoard && (
              <>
                <span className="favoritesOptionsBoardTag" title={ item.boardUrl }>
                  { decodeEntities(item.boardName) }
                </span>
                <span>·</span>
              </>
            ) }
            <span>{ formatLastPost(item.lastPostDate) }</span>
            { item.lastUsername && (
              <>
                <span>·</span>
                <span>{ decodeEntities(item.lastUsername) }</span>
              </>
            ) }
            { stale && (
              <span className="favoritesOptionsStale" title={ status === 'guest'
                ? 'Вы не авторизованы на этом форуме — данные не обновляются'
                : 'Форум недоступен — данные не обновляются'
              }>
                ⚠ не обновляется
              </span>
            ) }
          </div>
        </div>

        <button
          className="button small icon-only favoritesOptionsRemove"
          title="Убрать из избранного"
          onClick={ () => handleRemove(item) }
        >
          X
        </button>
      </li>
    );
  };

  return (
    <section className="favoritesOptions">
      <div className="favoritesOptionsHeader">
        <div>
          <h3>Избранное</h3>
          <h6>Мой ход { myTurnCount }/{ totalCount } · отслеживание новых сообщений</h6>
        </div>
        <div className="favoritesOptionsHeaderActions">
          <div className="favoritesOptionsViewToggle" role="group" aria-label="Вид списка">
            <button
              type="button"
              className={ `button small ${ viewMode === 'byForum' ? 'primary' : '' }` }
              aria-pressed={ viewMode === 'byForum' }
              onClick={ () => handleViewModeChange('byForum') }
            >
              По форумам
            </button>
            <button
              type="button"
              className={ `button small ${ viewMode === 'byDate' ? 'primary' : '' }` }
              aria-pressed={ viewMode === 'byDate' }
              onClick={ () => handleViewModeChange('byDate') }
            >
              По дате
            </button>
          </div>
          <button
            className="button small icon-only"
            disabled={ refreshing }
            title="Обновить"
            aria-label="Обновить"
            onClick={ () => requestRefresh(true) }
          >
            <MaskIcon src={ refreshIcon } />
          </button>
        </div>
      </div>

      { warning && <div className="text-secondary">{ warning }</div> }
      { error && <div className="text-error">{ error }</div> }
      { info && <div className="text-success">{ info }</div> }
      { refreshing && <div className="text-secondary">Проверяем новые сообщения…</div> }
      { !refreshing && lastRefreshAt && (
        <div className="text-secondary">
          Проверено: { new Date(lastRefreshAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
          { ` · каждые ${ intervalMinutes } мин.` }
        </div>
      ) }

      { !favorites.length && (
        <div className="emptyList">
          Пока пусто. Добавьте тему через попап расширения на странице эпизода.
        </div>
      ) }

      { favorites.length > 0 && viewMode === 'byForum' && grouped.map(group => (
        <div className="favoritesOptionsBoard" key={ group.boardUrl }>
          <a
            href={ `https://${ group.boardUrl }` }
            target="_blank"
            rel="noopener noreferrer"
            className="favoritesOptionsBoardTitle"
          >
            { decodeEntities(group.boardName) }
          </a>

          <ul className="favoritesOptionsList">
            { group.items.map(item => renderItem(item, false)) }
          </ul>
        </div>
      )) }

      { favorites.length > 0 && viewMode === 'byDate' && (
        <div className="favoritesOptionsBoard">
          <ul className="favoritesOptionsList favoritesOptionsListFlat">
            { sortedByDate.map(item => renderItem(item, true)) }
          </ul>
        </div>
      ) }
    </section>
  );
}
