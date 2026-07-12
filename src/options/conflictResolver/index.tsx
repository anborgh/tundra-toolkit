import { useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';

const STORAGE_KEYS = [ 'ignoreList', 'ignoredTopicsList', 'stickerPack', 'templates', 'forumData' ];
const MIGRATION_DONE_KEY = 'migrationDone';
const MIGRATION_PENDING_KEY = 'migrationPending';
const MIGRATION_CONFLICTS_KEY = 'migrationConflicts';
const makeChoiceKey = (group: string, id: string) => `${group}:${id}`;

type ConflictEntry = { id: string; local: any; sync: any };
type ConflictMap = Partial<Record<typeof STORAGE_KEYS[number], ConflictEntry[]>>;

const getUpdatedAt = (entity: any) => entity && typeof entity.updatedAt === 'number' ? entity.updatedAt : 0;
const pickNewer = (a: any, b: any) => getUpdatedAt(a) >= getUpdatedAt(b) ? a : b;

const flattenIgnoreList = (data: any[] = []) => {
  const entries: any[] = [];
  data.forEach(board => {
    board.forums?.forEach((forum: any) => {
      forum.users?.forEach((user: any) => {
        entries.push({
          id: `${board.boardID}:${forum.forumID}:${user.userID}`,
          boardID: board.boardID,
          boardName: board.boardName,
          boardUrl: board.boardUrl,
          forumID: forum.forumID,
          forumName: forum.forumName,
          user,
        });
      });
    });
  });
  return entries;
};

const buildIgnoreList = (entries: any[] = []) => {
  const boardsMap = new Map<string, any>();
  entries.forEach(entry => {
    if (!boardsMap.has(entry.boardID)) {
      boardsMap.set(entry.boardID, {
        boardID: entry.boardID,
        boardName: entry.boardName,
        boardUrl: entry.boardUrl,
        forums: new Map<string, any>(),
      });
    }
    const board = boardsMap.get(entry.boardID);
    if (!board.forums.has(entry.forumID)) {
      board.forums.set(entry.forumID, {
        forumID: entry.forumID,
        forumName: entry.forumName,
        users: [],
      });
    }
    const forum = board.forums.get(entry.forumID);
    forum.users.push(entry.user);
  });

  return Array.from(boardsMap.values()).map(board => ({
    ...board,
    forums: Array.from(board.forums.values()),
  }));
};

const flattenTopics = (data: any[] = []) => {
  const entries: any[] = [];
  data.forEach(board => {
    board.topics?.forEach((topic: any) => {
      entries.push({
        id: `${board.boardID}:${topic.topicID}`,
        boardID: board.boardID,
        boardName: board.boardName,
        boardUrl: board.boardUrl,
        topic,
      });
    });
  });
  return entries;
};

const buildTopics = (entries: any[] = []) => {
  const boardsMap = new Map<string, any>();
  entries.forEach(entry => {
    if (!boardsMap.has(entry.boardID)) {
      boardsMap.set(entry.boardID, {
        boardID: entry.boardID,
        boardName: entry.boardName,
        boardUrl: entry.boardUrl,
        topics: [],
      });
    }
    const board = boardsMap.get(entry.boardID);
    board.topics.push(entry.topic);
  });
  return Array.from(boardsMap.values());
};

const replaceEntries = (group: string, current: any[], conflicts: ConflictEntry[] = [], choices: Record<string, 'local' | 'sync'>, builder: (entries: any[]) => any[]) => {
  const entryMap = new Map<string, any>();
  current.forEach(item => entryMap.set(item.id, item));
  conflicts.forEach(conflict => {
    const choice = choices[makeChoiceKey(group, conflict.id)] || 'sync';
    const value = choice === 'local' ? conflict.local : conflict.sync;
    entryMap.set(conflict.id, pickNewer(value, entryMap.get(conflict.id) || value));
  });
  return builder(Array.from(entryMap.values()));
};

const replaceSimpleList = (group: string, current: any[] = [], conflicts: ConflictEntry[] = [], choices: Record<string, 'local' | 'sync'>) => {
  const map = new Map<any, any>();
  current.forEach(item => map.set(item.id, item));
  conflicts.forEach(conflict => {
    const choice = choices[makeChoiceKey(group, conflict.id)] || 'sync';
    const value = choice === 'local' ? conflict.local : conflict.sync;
    map.set(conflict.id, pickNewer(value, map.get(conflict.id) || value));
  });
  return Array.from(map.values());
};

const replaceForumData = (group: string, current: any, conflicts: ConflictEntry[] = [], choices: Record<string, 'local' | 'sync'>) => {
  if (!conflicts.length) return current;
  const choice = choices[makeChoiceKey(group, conflicts[0].id)] || 'sync';
  const value = choice === 'local' ? conflicts[0].local : conflicts[0].sync;
  if (!current) return value;
  return pickNewer(value, current);
};

const describeConflict = (key: string, conflict: ConflictEntry) => {
  if (key === 'ignoreList') {
    return conflict.local?.user?.userName || conflict.sync?.user?.userName || conflict.id;
  }
  if (key === 'ignoredTopicsList') {
    return conflict.local?.topic?.topicName || conflict.sync?.topic?.topicName || conflict.id;
  }
  if (key === 'stickerPack') {
    return conflict.local?.name || conflict.sync?.name || conflict.id;
  }
  if (key === 'templates') {
    return conflict.local?.name || conflict.sync?.name || conflict.id;
  }
  if (key === 'forumData') {
    return `forum ${conflict.local?.forumID || conflict.sync?.forumID || conflict.id}`;
  }
  return conflict.id;
};

export function ConflictResolver() {
  const [pending, setPending] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [choices, setChoices] = useState<Record<string, 'local' | 'sync'>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await safeStorageGet([ MIGRATION_PENDING_KEY, MIGRATION_CONFLICTS_KEY ]);
      const pendingFlag = !!data[MIGRATION_PENDING_KEY];
      const conflictsData = (data[MIGRATION_CONFLICTS_KEY] || {}) as ConflictMap;
      setPending(pendingFlag);
      setConflicts(conflictsData);
      const initialChoices: Record<string, 'local' | 'sync'> = {};
      Object.entries(conflictsData).forEach(([group, items]) => {
        (items || []).forEach((conflict: ConflictEntry) => {
          initialChoices[makeChoiceKey(group, conflict.id)] = 'sync';
        });
      });
      setChoices(initialChoices);
      setLoading(false);
    };
    load();
  }, []);

  const hasConflicts = useMemo(() => {
    return Object.values(conflicts).some(items => (items || []).length > 0);
  }, [conflicts]);

  if (loading || !pending || !hasConflicts) return null;

  const setChoice = (group: string, id: string, value: 'local' | 'sync') => {
    setChoices(prev => ({ ...prev, [makeChoiceKey(group, id)]: value }));
  };

  const applyChoices = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const storage = await safeStorageGet([ ...STORAGE_KEYS, MIGRATION_CONFLICTS_KEY ]);
      const conflictsData: ConflictMap = storage[MIGRATION_CONFLICTS_KEY] || {};

      const currentIgnore = flattenIgnoreList(storage.ignoreList || []);
      const currentTopics = flattenTopics(storage.ignoredTopicsList || []);

      const nextState: any = {
        ignoreList: replaceEntries('ignoreList', currentIgnore, conflictsData.ignoreList, choices, buildIgnoreList),
        ignoredTopicsList: replaceEntries('ignoredTopicsList', currentTopics, conflictsData.ignoredTopicsList, choices, buildTopics),
        stickerPack: replaceSimpleList('stickerPack', storage.stickerPack, conflictsData.stickerPack, choices),
        templates: replaceSimpleList('templates', storage.templates, conflictsData.templates, choices),
        forumData: replaceForumData('forumData', storage.forumData, conflictsData.forumData, choices),
        [MIGRATION_PENDING_KEY]: false,
        [MIGRATION_DONE_KEY]: true,
        [MIGRATION_CONFLICTS_KEY]: {},
      };

      await safeStorageSet(nextState);
      setPending(false);
      setConflicts({});
      setInfo('Конфликты решены, данные синхронизированы.');
    } catch (e) {
      setError('Не удалось применить выбор. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="conflictResolver">
      <h3>Конфликты синхронизации</h3>
      <p className="text-secondary">Данные найдены в нескольких браузерах. Выберите, какие версии оставить.</p>
      { Object.entries(conflicts).map(([key, items]) => (
        !!items?.length && (
          <div className="conflictGroup" key={ key }>
            <h5>{ key }</h5>
            <ul className="conflictList">
              { items.map(conflict => (
                <li className="conflictItem" key={ conflict.id }>
                  <div className="conflictTitle">{ describeConflict(key, conflict) }</div>
                  <div className="conflictChoices">
                    <label>
                      <input
                        type="radio"
                        name={ `${key}-${conflict.id}` }
                        value="sync"
                        checked={ choices[makeChoiceKey(key, conflict.id)] === 'sync' }
                        onChange={ () => setChoice(key, conflict.id, 'sync') }
                      />
                      Версия из sync
                    </label>
                    <label>
                      <input
                        type="radio"
                        name={ `${key}-${conflict.id}` }
                        value="local"
                        checked={ choices[makeChoiceKey(key, conflict.id)] === 'local' }
                        onChange={ () => setChoice(key, conflict.id, 'local') }
                      />
                      Версия с этого устройства
                    </label>
                  </div>
                </li>
              )) }
            </ul>
          </div>
        )
      )) }

      <div className="conflictActions">
        <button className="button success" onClick={ applyChoices } disabled={ saving }>
          { saving ? 'Сохраняю…' : 'Применить выбор' }
        </button>
        { error && <div className="text-error">{ error }</div> }
        { info && <div className="text-success">{ info }</div> }
      </div>
    </section>
  );
}
