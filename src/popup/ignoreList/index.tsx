import { useEffect, useMemo, useState } from 'preact/hooks';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { openSettingsSection } from '../../utils/settingsSections';
import { decodeEntities } from '../../utils';
import { MaskIcon } from '../../components/MaskIcon';
import externalLinkIcon from '../../assets/icons/external-link.svg';
import eyeIcon from '../../assets/icons/eye.svg';
import eyeOffIcon from '../../assets/icons/eye-off.svg';
import xIcon from '../../assets/icons/x.svg';
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import { usePopupToast } from '../popupToast';

import '../../components/icon.css';
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
  const { showError, clearToast } = usePopupToast();
  const [ state, setState ] = useState<IgnoreState>('loading');
  const [ context, setContext ] = useState<ForumContext | null>(null);
  const [ board, setBoard ] = useState<IBoardStore | null>(null);
  const [ users, setUsers ] = useState<IUserStore[]>([]);
  const [ topics, setTopics ] = useState<ITopicStore[]>([]);
  const [ error, setError ] = useState<string | null>(null);
  const [ info, setInfo ] = useState<string | null>(null);
  const [ contentRevealed, setContentRevealed ] = useState(false);
  const [ revealToggling, setRevealToggling ] = useState(false);

  const statusView = useMemo(() => {
    if (state === 'loading') {
      return { icon: loaderCircleIcon, text: 'Загружаем…', tone: 'muted' as const, spin: true };
    }
    if (error || state === 'unavailable' || state === 'noForum' || state === 'error') {
      return null;
    }
    if (info) {
      return { icon: circleCheckIcon, text: info, tone: 'success' as const, spin: false };
    }
    return null;
  }, [ state, error, info ]);

  const syncReadyState = (nextUsers: IUserStore[], nextTopics: ITopicStore[]) => {
    setState(nextUsers.length || nextTopics.length ? 'ready' : 'empty');
  };

  const loadRevealState = async () => {
    try {
      const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_ignore_reveal_state' });
      setContentRevealed(!!resp?.revealed);
    } catch (e) {
      setContentRevealed(false);
    }
  };

  const load = async () => {
    setError(null);
    clearToast();
    setState('loading');

    try {
      const available = await checkForumAvailability();
      if (!available) {
        setContext(null);
        setUsers([]);
        setTopics([]);
        setContentRevealed(false);
        setState('unavailable');
        showError('Откройте форум MyBB/RusFF и включите Tundra Toolkit.');
        return;
      }

      const activeCtx = await getActiveForumInfo();

      if (!activeCtx?.boardID) {
        setContext(null);
        setUsers([]);
        setTopics([]);
        setContentRevealed(false);
        setState('noForum');
        showError('Не нашли данные форума. Откройте страницу раздела или темы.');
        return;
      }

      const [ storage ] = await Promise.all([
        safeStorageGet([ 'ignoreList', 'ignoredTopicsList' ]),
        loadRevealState(),
      ]);
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
      showError('Не удалось загрузить список');
      setState('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (user: IUserStore) => {
    if (!context) return;

    const confirmed = confirm(`Убрать ${ user.userName } из игнора?`);
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
        setInfo('В Chrome Sync не хватило места. Список остался только в этом браузере.');
      } else {
        setInfo(null);
      }
      setError(null);
      clearToast();
    } catch (e) {
      setError('Не удалось обновить список');
      showError('Не удалось обновить список');
      setState('error');
    }
  };

  const handleRemoveTopic = async (topic: ITopicStore) => {
    if (!context) return;

    const topicTitle = decodeEntities(topic.topicName) || `Тема ${ topic.topicID }`;
    const confirmed = confirm(`Убрать тему «${ topicTitle }» из игнора?`);
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
        setInfo('В Chrome Sync не хватило места. Список остался только в этом браузере.');
      } else {
        setInfo(null);
      }
      setError(null);
      clearToast();
    } catch (e) {
      setError('Не удалось обновить список тем');
      showError('Не удалось обновить список тем');
      setState('error');
    }
  };

  const handleOpenSettings = () => openSettingsSection('blackList');

  const handleToggleReveal = async () => {
    if (revealToggling || state === 'loading' || state === 'unavailable') return;

    setRevealToggling(true);
    try {
      const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_ignore_toggle' });
      setContentRevealed(!!resp?.revealed);
    } catch (e) {
      showError('Не удалось переключить скрытый контент');
    } finally {
      setRevealToggling(false);
    }
  };

  const boardUrl = context?.boardUrl;
  const showForumGroups = !context?.forumID && !!board?.forums?.length;
  const revealDisabled = revealToggling || state === 'loading' || state === 'unavailable';
  const revealTitle = contentRevealed
    ? 'Скрыть посты и темы снова'
    : 'Временно показать весь скрытый контент';

  const renderUserItem = (user: IUserStore, key: string) => (
    <li class="ignoreItem" key={ key }>
      <div class="ignoreBody">
        <div class="ignoreTitleRow">
          { boardUrl ? (
            <a
              href={ `https://${ boardUrl }/profile.php?id=${ user.userID }` }
              target="_blank"
              rel="noreferrer"
              class="ignoreTitle"
              title={ user.userName }
            >
              { user.userName }
            </a>
          ) : (
            <span class="ignoreTitle" title={ user.userName }>{ user.userName }</span>
          ) }
        </div>
      </div>
      <button
        class="button small icon-only ignoreRemove"
        title="Убрать из игнора"
        aria-label={ `Убрать ${ user.userName } из игнора` }
        onClick={ () => handleRemove(user) }
      >
        <MaskIcon src={ xIcon } />
      </button>
    </li>
  );

  const renderTopicItem = (topic: ITopicStore) => {
    const title = decodeEntities(topic.topicName) || `Тема ${ topic.topicID }`;
    return (
      <li class="ignoreItem" key={ topic.topicID }>
        <div class="ignoreBody">
          <div class="ignoreTitleRow">
            { boardUrl ? (
              <a
                href={ `https://${ boardUrl }/viewtopic.php?id=${ topic.topicID }` }
                target="_blank"
                rel="noreferrer"
                class="ignoreTitle"
                title={ title }
              >
                { title }
              </a>
            ) : (
              <span class="ignoreTitle" title={ title }>{ title }</span>
            ) }
          </div>
        </div>
        <button
          class="button small icon-only ignoreRemove"
          title="Убрать тему из игнора"
          aria-label={ `Убрать тему ${ title } из игнора` }
          onClick={ () => handleRemoveTopic(topic) }
        >
          <MaskIcon src={ xIcon } />
        </button>
      </li>
    );
  };

  const emptyMessage = context?.forumID
    ? 'В этом разделе никого не игнорируете и нет скрытых тем'
    : 'На этом форуме никого не игнорируете и нет скрытых тем';

  return (
    <div class="ignoreTab">
      <div class="ignoreHeader">
        <div class="ignoreHeaderMeta">
          { context ? (
            <>
              <p class="ignoreHeaderBoard" title={ context.boardName }>{ context.boardName }</p>
              <p class="ignoreHeaderForum" title={ context.forumName || undefined }>
                { context.forumName || 'Текущий раздел' }
              </p>
            </>
          ) : (
            <p class="ignoreHeaderForum">Текущий раздел</p>
          ) }
        </div>
        <div class="ignoreHeaderActions">
          { statusView && (
            <span
              class={ `ignoreStatus ignoreStatus--${ statusView.tone }` }
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
            class="button small ignoreControlsToggle"
            disabled={ controlsToggling || state === 'loading' }
            onClick={ onToggleControls }
            title={ controlsVisible
              ? 'Скрыть кнопки ⊘ на страницах форума'
              : 'Показать кнопки ⊘ на страницах форума'
            }
          >
            { controlsVisible ? 'Скрыть кнопки' : 'Показать кнопки' }
          </button>
          <button
            class={ `button small ignoreHeaderReveal icon-only${ contentRevealed ? ' is-active' : '' }` }
            disabled={ revealDisabled }
            title={ revealTitle }
            aria-label={ revealTitle }
            aria-pressed={ contentRevealed }
            onClick={ handleToggleReveal }
          >
            <MaskIcon src={ contentRevealed ? eyeOffIcon : eyeIcon } />
          </button>
          <button
            class="button small ignoreHeaderSettingsLink icon-only"
            title="Открыть «Чёрный список» в настройках"
            aria-label="Открыть «Чёрный список» в настройках"
            onClick={ handleOpenSettings }
          >
            <MaskIcon src={ externalLinkIcon } />
          </button>
        </div>
      </div>

      { state === 'empty' && (
        <div class="emptyList">{ emptyMessage }</div>
      ) }

      { state === 'ready' && users.length > 0 && (
        <div class="ignoreSection">
          <h5 class="ignoreSectionTitle">Пользователи</h5>
          { showForumGroups ? (
            (board?.forums || []).filter(forum => (forum.users || []).length > 0).map(forum => (
              <div class="ignoreForumGroup" key={ forum.forumID }>
                <p class="ignoreForumGroupTitle">
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
                </p>
                <ul class="ignoreList">
                  { (forum.users || []).map(user =>
                    renderUserItem(user, `${ forum.forumID }-${ user.userID }`)
                  ) }
                </ul>
              </div>
            ))
          ) : (
            <ul class="ignoreList">
              { users.map(user => renderUserItem(user, user.userID)) }
            </ul>
          ) }
        </div>
      ) }

      { state === 'ready' && topics.length > 0 && (
        <div class="ignoreSection">
          <h5 class="ignoreSectionTitle">Темы</h5>
          <ul class="ignoreList">
            { topics.map(renderTopicItem) }
          </ul>
        </div>
      ) }
    </div>
  );
}
