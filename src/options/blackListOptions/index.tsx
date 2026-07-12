import { useEffect, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities } from '../../utils';

import './style.css';

export function BlackListOptions() {

  const [ data, setData ] = useState<IBoardStore[]>([]);
  const [ topicsData, setTopicsData ] = useState<IBoardTopicsStore[]>([]);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);

  const handleSaveResult = (result: Awaited<ReturnType<typeof safeStorageSet>>) => {
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
  }

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
  }

  useEffect(() => {

    const fetchData = async () => {
      const storage = await safeStorageGet([ 'ignoreList', 'ignoredTopicsList' ]);
      const storedData = storage[ 'ignoreList' ] || [];
      const storedTopics = storage[ 'ignoredTopicsList' ] || [];

      setData(storedData);
      setTopicsData(storedTopics);
    }

    fetchData()
  }, []);

  return (
    <section>
      { warning && (
        <div className="text-secondary" style={{ marginBottom: 8 }}>
          { warning }
        </div>
      ) }
      { error && (
        <div className="text-error" style={{ marginBottom: 8 }}>
          { error }
        </div>
      ) }
      <h3>Чёрный список</h3>
      <ul className="blackList">
        { data.map(({ boardID, boardName, boardUrl, forums }) => (
          <li className="blackListBoardItem" key={ boardID }>
            <a href={ `https://${ boardUrl }` } target="_blank" rel="noopener noreferrer">{ boardName }</a>
            <ul className="blackListForum">
              { forums.map(({ forumID, forumName, users }) => (
                <li className="blackListForumItem" key={ forumID }>
                  <a href={ `https://${ boardUrl }/viewforum.php?id=${ forumID }` } target="_blank" rel="noopener noreferrer">{ forumName }</a>
                  <ul className="blackListUsers">
                    { users.map(user => (
                      <li className="blackListUserItem" key={ user.userID }>
                        <a
                          href={ `https://${ boardUrl }/profile.php?id=${ user.userID }` }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          { user.userName }
                        </a>
                        <button
                          className="button small icon-only blackListRemoveItem"
                          title="Амнистировать пользователя"
                          onClick={ () => handleRemoveClick(boardID, forumID, user) }
                        >
                          X
                        </button>
                      </li>
                    )) }
                  </ul>
                </li>
              )) }
            </ul>
          </li>
        )) }
      </ul>

      {topicsData.length > 0 && (
        <>
          <h3>Игнорируемые темы</h3>
          <ul className="blackList">
            { topicsData.map(({ boardID, boardName, boardUrl, topics }) => (
              <li className="blackListBoardItem" key={ `topic-${ boardID }` }>
                <a href={ `https://${ boardUrl }` } target="_blank" rel="noopener noreferrer">{ boardName }</a>
                <ul className="blackListTopics">
                  { topics.map(topic => (
                    <li className="blackListTopicItem" key={ topic.topicID }>
                      <a
                        href={ `https://${ boardUrl }/viewtopic.php?id=${ topic.topicID }` }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        { decodeEntities(topic.topicName) }
                      </a>
                      <button
                        className="button small icon-only blackListRemoveItem"
                        title="Перестать игнорировать тему"
                        onClick={ () => handleRemoveTopicClick(boardID, topic) }
                      >
                        X
                      </button>
                    </li>
                  )) }
                </ul>
              </li>
            )) }
          </ul>
        </>
      )}

      {!data.length && !topicsData.length && (
        <div className="emptyList">
          Список пока пуст. Кнопка «Игнорировать» появится в постах пользователей на форуме, символ ⊘ — в списке тем.
        </div>
      )}
    </section>
  )
}
