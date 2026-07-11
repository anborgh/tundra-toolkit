import { useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities, filterFavoritesByAllowedHost } from '../../utils';

import './style.css';

const STORAGE_KEY = 'favoriteTopics';
const META_KEY = 'favoritesRefreshMeta';

type BoardStatus = 'ok' | 'guest' | 'error';

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

export function FavoritesOptions() {
  const [ favorites, setFavorites ] = useState<IFavoriteTopic[]>([]);
  const [ boardStatuses, setBoardStatuses ] = useState<Record<string, BoardStatus>>({});
  const [ lastRefreshAt, setLastRefreshAt ] = useState<number | null>(null);
  const [ intervalMinutes, setIntervalMinutes ] = useState(2);
  const [ refreshing, setRefreshing ] = useState(false);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ info, setInfo ] = useState<string | null>(null);

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
      });
      await loadFromStorage();
      if (resp?.intervalMinutes) setIntervalMinutes(resp.intervalMinutes);
      if (manual && resp?.success && resp?.refreshed === false) {
        const mins = resp.intervalMinutes || intervalMinutes;
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
      items: [ ...group.items ].sort((a, b) => (b.lastPostDate || 0) - (a.lastPostDate || 0)),
    }));
  }, [ favorites ]);

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

  return (
    <section className="favoritesOptions">
      <div className="favoritesOptionsHeader">
        <div>
          <h3>Избранное</h3>
          <h6>Мой ход { myTurnCount }/{ totalCount } · отслеживание новых сообщений</h6>
        </div>
        <button
          className="button small"
          disabled={ refreshing }
          onClick={ () => requestRefresh(true) }
        >
          Обновить
        </button>
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

      { grouped.map(group => (
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
            { group.items.map(item => {
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
            }) }
          </ul>
        </div>
      )) }
    </section>
  );
}
