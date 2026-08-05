import { useEffect, useMemo, useState } from 'react';
import {
  getCollectionLocations,
  ItemLocation,
  safeStorageGet,
  safeStorageSet,
  setItemCloudPinned,
} from '../../utils/storage';
import { decodeEntities } from '../../utils';
import { MaskIcon } from '../../components/MaskIcon';
import { CloudSyncButton, hasCloudOverflow } from '../../components/CloudSyncButton';
import xIcon from '../../assets/icons/x.svg';
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import circleAlertIcon from '../../assets/icons/circle-alert.svg';

import '../../components/icon.css';
import './style.css';

export function BlackListOptions() {
  const [ data, setData ] = useState<IBoardStore[]>([]);
  const [ topicsData, setTopicsData ] = useState<IBoardTopicsStore[]>([]);
  const [ loaded, setLoaded ] = useState(false);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ userLocations, setUserLocations ] = useState<Record<string, ItemLocation>>({});
  const [ topicLocations, setTopicLocations ] = useState<Record<string, ItemLocation>>({});

  const refreshLocations = async () => {
    const [ users, topics ] = await Promise.all([
      getCollectionLocations('ignoreList'),
      getCollectionLocations('ignoredTopicsList'),
    ]);
    setUserLocations(users);
    setTopicLocations(topics);
  };

  const usersCount = useMemo(
    () => data.reduce(
      (total, board) => total + (board.forums || []).reduce(
        (forumTotal, forum) => forumTotal + (forum.users || []).length,
        0,
      ),
      0,
    ),
    [ data ],
  );

  const topicsCount = useMemo(
    () => topicsData.reduce((total, board) => total + (board.topics || []).length, 0),
    [ topicsData ],
  );

  const statusView = useMemo(() => {
    if (!loaded) {
      return { icon: loaderCircleIcon, text: 'Загружаем…', tone: 'muted' as const, spin: true };
    }
    if (error) {
      return { icon: circleAlertIcon, text: error, tone: 'error' as const, spin: false };
    }
    if (warning) {
      return { icon: circleCheckIcon, text: warning, tone: 'success' as const, spin: false };
    }
    return null;
  }, [ loaded, error, warning ]);

  const handleSaveResult = (result: Awaited<ReturnType<typeof safeStorageSet>>) => {
    refreshLocations().catch(() => {});
    if (result.fallback) {
      setWarning('Память синхронизации переполнена. Списки сохранены только в этом браузере.');
    } else {
      setWarning(null);
    }
  };

  const handleSaveError = () => {
    setError('Не удалось сохранить список: недостаточно памяти.');
  };

  const handleRemoveClick = (boardID: string, forumID: string, user: { userName: string, userID: string }) => {
    const isConfirmed = confirm(`Разбанить ${ user.userName }?`);
    if (!isConfirmed) return;

    const newData = data.map(board => {
      if (board.boardID !== boardID) return board;

      const newForums = board.forums.map(forum => {
        if (forum.forumID !== forumID) return forum;

        const newUsers = forum.users.filter(item => item.userID !== user.userID);

        return newUsers.length ? {
          ...forum,
          users: newUsers,
        } : null;
      }).filter(item => item !== null);

      return newForums.length ? {
        ...board,
        forums: newForums,
      } : null;
    }).filter(item => item !== null);

    setError(null);
    setData(newData);
    safeStorageSet({
      ignoreList: newData,
    }).then(handleSaveResult).catch(() => handleSaveError());
  };

  const handleRemoveTopicClick = (boardID: string, topic: { topicName: string, topicID: string }) => {
    const isConfirmed = confirm(`Перестать игнорировать тему «${ decodeEntities(topic.topicName) }»?`);
    if (!isConfirmed) return;

    const newData = topicsData.map(board => {
      if (board.boardID !== boardID) return board;

      const newTopics = board.topics.filter(item => item.topicID !== topic.topicID);

      return newTopics.length ? {
        ...board,
        topics: newTopics,
      } : null;
    }).filter(item => item !== null);

    setError(null);
    setTopicsData(newData);
    safeStorageSet({
      ignoredTopicsList: newData,
    }).then(handleSaveResult).catch(() => handleSaveError());
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const storage = await safeStorageGet([ 'ignoreList', 'ignoredTopicsList' ]);
        setData(storage[ 'ignoreList' ] || []);
        setTopicsData(storage[ 'ignoredTopicsList' ] || []);
        await refreshLocations();
      } catch (e) {
        setError('Не удалось загрузить чёрный список');
      } finally {
        setLoaded(true);
      }
    };

    fetchData();
  }, []);

  const toggleUserCloud = async (boardID: string, forumID: string) => {
    const id = `${ boardID }:${ forumID }`;
    const current = userLocations[id] || 'local';
    const result = await setItemCloudPinned('ignoreList', id, current !== 'localPinned');
    setUserLocations(prev => ({ ...prev, [id]: result.location }));
    setError(result.error || null);
  };

  const toggleTopicCloud = async (boardID: string) => {
    const id = `${ boardID }`;
    const current = topicLocations[id] || 'local';
    const result = await setItemCloudPinned('ignoredTopicsList', id, current !== 'localPinned');
    setTopicLocations(prev => ({ ...prev, [id]: result.location }));
    setError(result.error || null);
  };

  const showCloudControls = hasCloudOverflow(userLocations) || hasCloudOverflow(topicLocations);

  return (
    <section className="blackListOptions">
      <div className="blackListOptionsHeader">
        <div>
          <h3>Чёрный список</h3>
          <h6>
            Пользователи { usersCount } · темы { topicsCount }
          </h6>
        </div>
        <div className="blackListOptionsHeaderActions">
          { statusView && (
            <span
              className={ `blackListOptionsStatus blackListOptionsStatus--${ statusView.tone }` }
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
        </div>
      </div>

      { error && (
        <div className="text-error" style={{ marginBottom: 8 }}>
          { error }
        </div>
      ) }

      { loaded && !data.length && !topicsData.length && (
        <div className="emptyList">
          Список пока пуст. Кнопка ⊘ появится в ссылках поста (рядом с E-mail) и в списке тем.
        </div>
      ) }

      { data.length > 0 && (
        <div className="blackListOptionsSection">
          <h5 className="blackListOptionsSectionTitle">Пользователи</h5>
          { data.map(({ boardID, boardName, boardUrl, forums }) => (
            <div className="blackListOptionsBoard" key={ boardID }>
              <a
                href={ `https://${ boardUrl }` }
                target="_blank"
                rel="noopener noreferrer"
                className="blackListOptionsBoardTitle"
              >
                { boardName }
              </a>

              { forums.map(({ forumID, forumName, users }) => (
                <div className="blackListOptionsForum" key={ forumID }>
                  <div className="blackListOptionsForumHeader">
                    <a
                      href={ `https://${ boardUrl }/viewforum.php?id=${ forumID }` }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="blackListOptionsForumTitle"
                    >
                      { forumName }
                    </a>
                    { showCloudControls && (
                      <CloudSyncButton
                        location={ userLocations[`${ boardID }:${ forumID }`] || 'local' }
                        onToggle={ () => toggleUserCloud(boardID, forumID) }
                      />
                    ) }
                  </div>
                  <ul className="blackListOptionsList">
                    { users.map(user => (
                      <li className="blackListOptionsItem" key={ user.userID }>
                        <div className="blackListOptionsBody">
                          <div className="blackListOptionsTitleRow">
                            <a
                              href={ `https://${ boardUrl }/profile.php?id=${ user.userID }` }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              { user.userName }
                            </a>
                          </div>
                        </div>
                        <button
                          className="button small icon-only blackListOptionsRemove"
                          title="Амнистировать пользователя"
                          aria-label={ `Амнистировать ${ user.userName }` }
                          onClick={ () => handleRemoveClick(boardID, forumID, user) }
                        >
                          <MaskIcon src={ xIcon } />
                        </button>
                      </li>
                    )) }
                  </ul>
                </div>
              )) }
            </div>
          )) }
        </div>
      ) }

      { topicsData.length > 0 && (
        <div className="blackListOptionsSection">
          <h5 className="blackListOptionsSectionTitle">Темы</h5>
          { topicsData.map(({ boardID, boardName, boardUrl, topics }) => (
            <div className="blackListOptionsBoard" key={ `topic-${ boardID }` }>
              <div className="blackListOptionsForumHeader">
                <a
                  href={ `https://${ boardUrl }` }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="blackListOptionsBoardTitle"
                >
                  { boardName }
                </a>
                { showCloudControls && (
                  <CloudSyncButton
                    location={ topicLocations[String(boardID)] || 'local' }
                    onToggle={ () => toggleTopicCloud(boardID) }
                  />
                ) }
              </div>
              <ul className="blackListOptionsList">
                { topics.map(topic => (
                  <li className="blackListOptionsItem" key={ topic.topicID }>
                    <div className="blackListOptionsBody">
                      <div className="blackListOptionsTitleRow">
                        <a
                          href={ `https://${ boardUrl }/viewtopic.php?id=${ topic.topicID }` }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          { decodeEntities(topic.topicName) }
                        </a>
                      </div>
                    </div>
                    <button
                      className="button small icon-only blackListOptionsRemove"
                      title="Перестать игнорировать тему"
                      aria-label={ `Перестать игнорировать тему ${ decodeEntities(topic.topicName) }` }
                      onClick={ () => handleRemoveTopicClick(boardID, topic) }
                    >
                      <MaskIcon src={ xIcon } />
                    </button>
                  </li>
                )) }
              </ul>
            </div>
          )) }
        </div>
      ) }
    </section>
  );
}
