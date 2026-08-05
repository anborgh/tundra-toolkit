import { useEffect, useMemo, useState } from 'preact/hooks';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { openSettingsSection } from '../../utils/settingsSections';
import { decodeEntities } from '../../utils';

import './style.css';

type ForumContext = {
  boardID: string;
  forumID: string | null;
  boardName?: string;
  forumName?: string;
  boardUrl?: string;
};

type IgnoreState = 'loading' | 'unavailable' | 'noForum' | 'empty' | 'ready' | 'error';

type IgnoreListProps = {
  controlsVisible: boolean;
  controlsToggling: boolean;
  onToggleControls: () => void;
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

const checkForumAvailability = async (): Promise<boolean> => {
  try {
    const [ pingResp, forumResp ] = await Promise.all([
      sendMessageToActiveTab({ type: 'tundra_toolkit_availability_ping' }).catch(() => null),
      sendMessageToActiveTab({ type: 'tundra_toolkit_forum_info' }).catch(() => null),
    ]);
    if (pingResp?.available) return true;
    const forumData = forumResp?.forumData;
    if (forumData?.boardID) return true;
    return false;
  } catch (e) {
    return false;
  }
};

const getActiveForumInfo = async (): Promise<ForumContext | null> => {
  try {
    const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_forum_info' });
    const forumData = resp?.forumData;
    if (!forumData?.boardID) return null;
    return {
      boardID: `${ forumData.boardID }`,
      forumID: forumData.forumID ? `${ forumData.forumID }` : null,
      boardUrl: forumData.boardUrl ? `${ forumData.boardUrl }` : undefined,
    };
  } catch (e) {
    return null;
  }
};

const cleanupBoard = (ignoreList: IBoardStore[], ctx: ForumContext, removeUserId?: string) => {
  const cleaned = ignoreList.map(board => {
    if (`${ board.boardID }` !== ctx.boardID) return board;

    const newForums = (board.forums || [])
      .map(forum => {
        if (ctx.forumID && `${ forum.forumID }` !== ctx.forumID) return forum;

        const users = removeUserId
          ? (forum.users || []).filter(user => `${ user.userID }` !== removeUserId)
          : (forum.users || []);

        return users.length ? { ...forum, users } : null;
      })
      .filter(Boolean) as IForumStore[];

    return newForums.length ? { ...board, forums: newForums } : null;
  }).filter(Boolean) as IBoardStore[];

  return cleaned;
};

const cleanupTopicsBoard = (
  topicsList: IBoardTopicsStore[],
  boardID: string,
  removeTopicId?: string,
) => {
  return topicsList.map(board => {
    if (`${ board.boardID }` !== boardID) return board;

    const topics = removeTopicId
      ? (board.topics || []).filter(topic => `${ topic.topicID }` !== removeTopicId)
      : (board.topics || []);

    return topics.length ? { ...board, topics } : null;
  }).filter(Boolean) as IBoardTopicsStore[];
};

export function IgnoreList({ controlsVisible, controlsToggling, onToggleControls }: IgnoreListProps) {
  const [ state, setState ] = useState<IgnoreState>('loading');
  const [ context, setContext ] = useState<ForumContext | null>(null);
  const [ board, setBoard ] = useState<IBoardStore | null>(null);
  const [ users, setUsers ] = useState<IUserStore[]>([]);
  const [ topics, setTopics ] = useState<ITopicStore[]>([]);
  const [ loading, setLoading ] = useState<boolean>(false);
  const [ error, setError ] = useState<string | null>(null);
  const [ warning, setWarning ] = useState<string | null>(null);

  const lastUpdatedAt = useMemo(() => {
    if (!users.length) return null;
    return users.reduce((acc, user) => Math.max(acc, user.updatedAt || 0), 0);
  }, [ users ]);

  const syncReadyState = (nextUsers: IUserStore[], nextTopics: ITopicStore[]) => {
    setState(nextUsers.length || nextTopics.length ? 'ready' : 'empty');
  };

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const available = await checkForumAvailability();
      if (!available) {
        setContext(null);
        setUsers([]);
        setTopics([]);
        setState('unavailable');
        return;
      }

      const activeCtx = await getActiveForumInfo();

      if (!activeCtx?.boardID) {
        setContext(null);
        setUsers([]);
        setTopics([]);
        setState('noForum');
        return;
      }

      const storage = await safeStorageGet([ 'ignoreList', 'ignoredTopicsList' ]);
      const boardID = activeCtx.boardID;
      const forumID = activeCtx.forumID;
      const ignoreList: IBoardStore[] = storage?.ignoreList || [];
      const ignoredTopicsList: IBoardTopicsStore[] = storage?.ignoredTopicsList || [];

      const currentBoard = ignoreList.find(item => `${ item.boardID }` === boardID) || null;
      const currentTopicsBoard = ignoredTopicsList.find(item => `${ item.boardID }` === boardID) || null;
      const forum = forumID ? currentBoard?.forums?.find(item => `${ item.forumID }` === forumID) : null;
      const topicsList = currentTopicsBoard?.topics || [];

      setBoard(currentBoard);
      setContext({
        boardID,
        forumID,
        boardName: currentBoard?.boardName || currentTopicsBoard?.boardName || 'Форум',
        forumName: forumID ? (forum?.forumName || 'Раздел') : 'Все разделы',
        boardUrl: currentBoard?.boardUrl || currentTopicsBoard?.boardUrl || activeCtx.boardUrl,
      });

      const usersList = forumID
        ? (forum?.users || [])
        : (currentBoard?.forums || []).flatMap(f => f.users || []);

      setUsers(usersList);
      setTopics(topicsList);
      syncReadyState(usersList, topicsList);
    } catch (e) {
      setError('Не удалось загрузить список');
      setState('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (user: IUserStore) => {
    if (!context) return;

    const confirmed = confirm(`Разбанить ${ user.userName }?`);
    if (!confirmed) return;

    try {
      const storage = await safeStorageGet([ 'ignoreList' ]);
      const ignoreList: IBoardStore[] = storage?.ignoreList || [];
      const newData = cleanupBoard(ignoreList, context, `${ user.userID }`);

      setUsers(prev => {
        const newUsers = prev.filter(item => `${ item.userID }` !== `${ user.userID }`);
        syncReadyState(newUsers, topics);
        return newUsers;
      });

      const result = await safeStorageSet({ ignoreList: newData });
      if (result.fallback) {
        setWarning('Память синхронизации переполнена. Список сохранён только в этом браузере.');
      } else {
        setWarning(null);
      }
    } catch (e) {
      setError('Не удалось обновить список');
      setState('error');
    }
  };

  const handleRemoveTopic = async (topic: ITopicStore) => {
    if (!context) return;

    const topicTitle = decodeEntities(topic.topicName) || `Тема ${ topic.topicID }`;
    const confirmed = confirm(`Перестать игнорировать тему «${ topicTitle }»?`);
    if (!confirmed) return;

    try {
      const storage = await safeStorageGet([ 'ignoredTopicsList' ]);
      const ignoredTopicsList: IBoardTopicsStore[] = storage?.ignoredTopicsList || [];
      const newData = cleanupTopicsBoard(ignoredTopicsList, context.boardID, `${ topic.topicID }`);

      setTopics(prev => {
        const newTopics = prev.filter(item => `${ item.topicID }` !== `${ topic.topicID }`);
        syncReadyState(users, newTopics);
        return newTopics;
      });

      const result = await safeStorageSet({ ignoredTopicsList: newData });
      if (result.fallback) {
        setWarning('Память синхронизации переполнена. Список сохранён только в этом браузере.');
      } else {
        setWarning(null);
      }
    } catch (e) {
      setError('Не удалось обновить список тем');
      setState('error');
    }
  };

  const handleOpenSettings = () => openSettingsSection('blackList');

  const renderStatus = () => {
    if (state === 'loading') return <span class="text-secondary">Загружаем…</span>;
    if (state === 'unavailable') return <span class="text-error">Текущая вкладка не поддерживает форум</span>;
    if (state === 'noForum') return <span class="text-error">Не нашли данные форума. Откройте вкладку с разделом.</span>;
    if (state === 'empty') {
      const scope = context?.forumID ? 'В этом разделе' : 'На этом форуме';
      return <span class="text-secondary">{ scope } никого не игнорируете и нет скрытых тем</span>;
    }
    if (state === 'error') return <span class="text-error">{ error || 'Ошибка' }</span>;
    return null;
  };

  const boardUrl = context?.boardUrl;

  return (
    <div class="ignoreTab">
      <div class="ignoreHeader">
        <div>
          <p class="text-secondary">
            { context ? `${ context.boardName } — ${ context.forumName }` : 'Текущий раздел' }
          </p>
          { warning && (
            <p class="text-secondary" aria-live="polite">
              { warning }
            </p>
          ) }
        </div>
        <div class="ignoreHeaderActions">
          <button
            class="button small ignoreControlsToggle"
            disabled={ controlsToggling }
            onClick={ onToggleControls }
          >
            { controlsVisible ? 'Скрыть элементы игнора' : 'Показать элементы игнора' }
          </button>
          <button
            class="button small ignoreHeaderSettingsLink"
            title="Открыть полный чёрный список в настройках расширения"
            aria-label="Открыть полный чёрный список в настройках расширения"
            onClick={ handleOpenSettings }
          >
            »
          </button>
        </div>
      </div>

      <div class="ignoreStatus" aria-live="polite">{ renderStatus() }</div>

      { state === 'ready' && users.length > 0 && (
        <ul class="blackList ignoreList">
          <li class="blackListBoardItem">
            { boardUrl ? (
              <a href={ `https://${ boardUrl }` } target="_blank" rel="noreferrer">{ context?.boardName }</a>
            ) : (
              <span>{ context?.boardName }</span>
            ) }
            <ul class="blackListForum">
              { (context?.forumID && board)
                ? (
                  <li class="blackListForumItem">
                    { boardUrl ? (
                      <a
                        href={ `https://${ boardUrl }/viewforum.php?id=${ context?.forumID }` }
                        target="_blank"
                        rel="noreferrer"
                      >
                        { context?.forumName }
                      </a>
                    ) : (
                      <span>{ context?.forumName }</span>
                    ) }
                    <ul class="blackListUsers">
                      { users.map(user => (
                        <li class="blackListUserItem" key={ user.userID }>
                          { boardUrl ? (
                            <a
                              href={ `https://${ boardUrl }/profile.php?id=${ user.userID }` }
                              target="_blank"
                              rel="noreferrer"
                            >
                              { user.userName }
                            </a>
                          ) : (
                            <span>{ user.userName }</span>
                          ) }
                          <button
                            class="button small icon-only blackListRemoveItem"
                            title="Амнистировать пользователя"
                            aria-label={ `Амнистировать ${ user.userName }` }
                            onClick={ () => handleRemove(user) }
                          >
                            X
                          </button>
                        </li>
                      )) }
                    </ul>
                  </li>
                )
                : (
                  (board?.forums || []).map(forum => (
                    <li class="blackListForumItem" key={ forum.forumID }>
                      { boardUrl ? (
                        <a
                          href={ `https://${ boardUrl }/viewforum.php?id=${ forum.forumID }` }
                          target="_blank"
                          rel="noreferrer"
                        >
                          { forum.forumName }
                        </a>
                      ) : (
                        <span>{ forum.forumName }</span>
                      ) }
                      <ul class="blackListUsers">
                        { (forum.users || []).map(user => (
                          <li class="blackListUserItem" key={ `${ forum.forumID }-${ user.userID }` }>
                            { boardUrl ? (
                              <a
                                href={ `https://${ boardUrl }/profile.php?id=${ user.userID }` }
                                target="_blank"
                                rel="noreferrer"
                              >
                                { user.userName }
                              </a>
                            ) : (
                              <span>{ user.userName }</span>
                            ) }
                            <button
                              class="button small icon-only blackListRemoveItem"
                              title="Амнистировать пользователя"
                              aria-label={ `Амнистировать ${ user.userName }` }
                              onClick={ () => handleRemove(user) }
                            >
                              X
                            </button>
                          </li>
                        )) }
                      </ul>
                    </li>
                  ))
                )
              }
            </ul>
          </li>
        </ul>
      ) }

      { state === 'ready' && context && (
        <div class="ignoreTopicsSection">
          <p class="ignoreSectionTitle">Игнорируемые темы</p>
          { topics.length === 0 ? (
            <div class="ignoreStatus">
              <span class="text-secondary">На этом форуме нет игнорируемых тем</span>
            </div>
          ) : (
            <ul class="blackList ignoreList">
              <li class="blackListBoardItem">
                <ul class="blackListTopics">
                  { topics.map(topic => (
                    <li class="blackListTopicItem" key={ topic.topicID }>
                      { boardUrl ? (
                        <a
                          href={ `https://${ boardUrl }/viewtopic.php?id=${ topic.topicID }` }
                          target="_blank"
                          rel="noreferrer"
                        >
                          { decodeEntities(topic.topicName) || `Тема ${ topic.topicID }` }
                        </a>
                      ) : (
                        <span>{ decodeEntities(topic.topicName) || `Тема ${ topic.topicID }` }</span>
                      ) }
                      <button
                        class="button small icon-only blackListRemoveItem"
                        title="Перестать игнорировать тему"
                        aria-label={ `Перестать игнорировать тему ${ decodeEntities(topic.topicName) || topic.topicID }` }
                        onClick={ () => handleRemoveTopic(topic) }
                      >
                        X
                      </button>
                    </li>
                  )) }
                </ul>
              </li>
            </ul>
          ) }
        </div>
      ) }
    </div>
  );
}
