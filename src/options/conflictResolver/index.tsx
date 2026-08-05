import { useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';
import { decodeEntities } from '../../utils';

const STORAGE_KEYS = [ 'ignoreList', 'ignoredTopicsList', 'stickerPack', 'templates', 'forumData' ] as const;
const MIGRATION_DONE_KEY = 'migrationDone';
const MIGRATION_PENDING_KEY = 'migrationPending';
const MIGRATION_CONFLICTS_KEY = 'migrationConflicts';
const makeChoiceKey = (group: string, id: string | number) => `${group}:${id}`;

type StorageKey = typeof STORAGE_KEYS[number];
type ConflictEntry = { id: string | number; local: any; sync: any };
type ConflictMap = Partial<Record<StorageKey, ConflictEntry[]>>;
type ConflictSide = 'local' | 'sync';
type DetailRow = { label: string; value: string };

const GROUP_LABELS: Record<StorageKey, string> = {
  ignoreList: 'Черный список — пользователи',
  ignoredTopicsList: 'Черный список — темы',
  stickerPack: 'Стикеры',
  templates: 'Черновики',
  forumData: 'Данные форума',
};

const SIDE_LABELS: Record<ConflictSide, string> = {
  sync: 'Синхронизация',
  local: 'Это устройство',
};

const getUpdatedAt = (entity: any) => entity && typeof entity.updatedAt === 'number' ? entity.updatedAt : 0;
const pickNewer = (a: any, b: any) => getUpdatedAt(a) >= getUpdatedAt(b) ? a : b;

const getConflictUpdatedAt = (key: string, value: any) => {
  if (!value) return 0;
  if (key === 'ignoreList') return getUpdatedAt(value.user || value);
  if (key === 'ignoredTopicsList') return getUpdatedAt(value.topic || value);
  return getUpdatedAt(value);
};

const getNewerSide = (key: string, conflict: ConflictEntry): ConflictSide | null => {
  const localTs = getConflictUpdatedAt(key, conflict.local);
  const syncTs = getConflictUpdatedAt(key, conflict.sync);
  if (!localTs && !syncTs) return null;
  if (localTs === syncTs) return null;
  return localTs > syncTs ? 'local' : 'sync';
};

const formatUpdatedAt = (value: any) => {
  const ts = typeof value === 'number' ? value : getUpdatedAt(value);
  if (!ts) return 'неизвестно';
  return new Date(ts).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncate = (value: string, max = 160) => {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${ text.slice(0, max - 1) }…`;
};

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

const replaceEntries = (group: string, current: any[], conflicts: ConflictEntry[] = [], choices: Record<string, ConflictSide>, builder: (entries: any[]) => any[]) => {
  const entryMap = new Map<string | number, any>();
  current.forEach(item => entryMap.set(item.id, item));
  conflicts.forEach(conflict => {
    const choice = choices[makeChoiceKey(group, conflict.id)] || 'sync';
    const value = choice === 'local' ? conflict.local : conflict.sync;
    entryMap.set(conflict.id, pickNewer(value, entryMap.get(conflict.id) || value));
  });
  return builder(Array.from(entryMap.values()));
};

const replaceSimpleList = (group: string, current: any[] = [], conflicts: ConflictEntry[] = [], choices: Record<string, ConflictSide>) => {
  const map = new Map<string | number, any>();
  current.forEach(item => map.set(item.id, item));
  conflicts.forEach(conflict => {
    const choice = choices[makeChoiceKey(group, conflict.id)] || 'sync';
    const value = choice === 'local' ? conflict.local : conflict.sync;
    map.set(conflict.id, pickNewer(value, map.get(conflict.id) || value));
  });
  return Array.from(map.values());
};

const replaceForumData = (group: string, current: any, conflicts: ConflictEntry[] = [], choices: Record<string, ConflictSide>) => {
  if (!conflicts.length) return current;
  const choice = choices[makeChoiceKey(group, conflicts[0].id)] || 'sync';
  const value = choice === 'local' ? conflicts[0].local : conflicts[0].sync;
  if (!current) return value;
  return pickNewer(value, current);
};

const describeConflict = (key: string, conflict: ConflictEntry) => {
  if (key === 'ignoreList') {
    return conflict.local?.user?.userName || conflict.sync?.user?.userName || String(conflict.id);
  }
  if (key === 'ignoredTopicsList') {
    const name = conflict.local?.topic?.topicName || conflict.sync?.topic?.topicName;
    return decodeEntities(name) || String(conflict.id);
  }
  if (key === 'stickerPack') {
    return conflict.local?.name || conflict.sync?.name || String(conflict.id);
  }
  if (key === 'templates') {
    return conflict.local?.name || conflict.sync?.name || String(conflict.id);
  }
  if (key === 'forumData') {
    const name = conflict.local?.topicName || conflict.sync?.topicName;
    return decodeEntities(name) || `Форум ${ conflict.local?.forumID || conflict.sync?.forumID || conflict.id }`;
  }
  return String(conflict.id);
};

const getVersionDetails = (key: string, value: any): { title: string; rows: DetailRow[]; preview?: string } => {
  if (!value) {
    return { title: 'Нет данных', rows: [] };
  }

  if (key === 'ignoreList') {
    return {
      title: value.user?.userName || 'Пользователь',
      rows: [
        { label: 'Форум', value: value.boardName || value.boardID || '—' },
        { label: 'Раздел', value: value.forumName || value.forumID || '—' },
        { label: 'ID пользователя', value: String(value.user?.userID ?? '—') },
        { label: 'Обновлено', value: formatUpdatedAt(value.user || value) },
      ],
    };
  }

  if (key === 'ignoredTopicsList') {
    return {
      title: decodeEntities(value.topic?.topicName) || 'Тема',
      rows: [
        { label: 'Форум', value: value.boardName || value.boardID || '—' },
        { label: 'ID темы', value: String(value.topic?.topicID ?? '—') },
        { label: 'Обновлено', value: formatUpdatedAt(value.topic || value) },
      ],
    };
  }

  if (key === 'stickerPack') {
    const items = Array.isArray(value.items) ? value.items : [];
    return {
      title: value.name || 'Набор стикеров',
      rows: [
        { label: 'Стикеров', value: String(items.length) },
        { label: 'Обновлено', value: formatUpdatedAt(value) },
      ],
      preview: items.length
        ? items.slice(0, 3).map((item: string) => truncate(String(item), 48)).join('\n')
        : 'Пустой набор',
    };
  }

  if (key === 'templates') {
    const content = typeof value.content === 'string'
      ? value.content
      : (typeof value.text === 'string' ? value.text : '');
    return {
      title: value.name || 'Черновик',
      rows: [
        { label: 'Обновлено', value: formatUpdatedAt(value) },
      ],
      preview: content ? truncate(content, 220) : 'Пустой черновик',
    };
  }

  if (key === 'forumData') {
    return {
      title: decodeEntities(value.topicName) || `Форум ${ value.forumID || '—' }`,
      rows: [
        { label: 'Форум', value: value.boardUrl || value.boardID || '—' },
        { label: 'ID раздела', value: String(value.forumID ?? '—') },
        { label: 'ID темы', value: String(value.topicID ?? '—') },
        { label: 'ID пользователя', value: String(value.userID ?? '—') },
        { label: 'Обновлено', value: formatUpdatedAt(value) },
      ],
    };
  }

  return {
    title: String(value.name || value.id || 'Версия'),
    rows: [{ label: 'Обновлено', value: formatUpdatedAt(value) }],
  };
};

function ConflictVersionCard({
  group,
  conflictId,
  side,
  value,
  selected,
  isNewer,
  onSelect,
}: {
  group: string;
  conflictId: string | number;
  side: ConflictSide;
  value: any;
  selected: boolean;
  isNewer: boolean;
  onSelect: () => void;
}) {
  const details = getVersionDetails(group, value);
  const inputId = `conflict-${group}-${conflictId}-${side}`;
  const className = [
    'conflictVersion',
    selected ? 'selected' : '',
    isNewer ? 'newer' : '',
  ].filter(Boolean).join(' ');

  return (
    <label
      className={ className }
      htmlFor={ inputId }
    >
      <div className="conflictVersionHeader">
        <input
          id={ inputId }
          type="radio"
          name={ `${group}-${conflictId}` }
          value={ side }
          checked={ selected }
          onChange={ onSelect }
        />
        <span className="conflictVersionSide">{ SIDE_LABELS[side] }</span>
        { isNewer && <span className="conflictVersionBadge">новее</span> }
      </div>
      <div className="conflictVersionTitle">{ details.title }</div>
      <dl className="conflictVersionMeta">
        { details.rows.map(row => (
          <div className="conflictVersionMetaRow" key={ row.label }>
            <dt>{ row.label }</dt>
            <dd>{ row.value }</dd>
          </div>
        )) }
      </dl>
      { details.preview && (
        <pre className="conflictVersionPreview">{ details.preview }</pre>
      ) }
    </label>
  );
}

export function ConflictResolver() {
  const [pending, setPending] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [choices, setChoices] = useState<Record<string, ConflictSide>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await safeStorageGet([ MIGRATION_PENDING_KEY, MIGRATION_CONFLICTS_KEY ]);
        const pendingFlag = !!data[MIGRATION_PENDING_KEY];
        const conflictsData = (data[MIGRATION_CONFLICTS_KEY] || {}) as ConflictMap;
        setPending(pendingFlag);
        setConflicts(conflictsData);
        const initialChoices: Record<string, ConflictSide> = {};
        Object.entries(conflictsData).forEach(([group, items]) => {
          (items || []).forEach((conflict: ConflictEntry) => {
            initialChoices[makeChoiceKey(group, conflict.id)] = 'sync';
          });
        });
        setChoices(initialChoices);
      } catch (e) {
        setError('Не удалось загрузить конфликты.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hasConflicts = useMemo(() => {
    return Object.values(conflicts).some(items => (items || []).length > 0);
  }, [conflicts]);

  if (loading || !pending || !hasConflicts) return null;

  const setChoice = (group: string, id: string | number, value: ConflictSide) => {
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
      <p className="text-secondary">
        Одинаковые записи отличаются в синхронизации и на этом устройстве.
        Сравните обе версии и выберите, какую оставить.
      </p>
      { Object.entries(conflicts).map(([key, items]) => (
        !!items?.length && (
          <div className="conflictGroup" key={ key }>
            <h5>{ GROUP_LABELS[key as StorageKey] || key }</h5>
            <ul className="conflictList">
              { items.map(conflict => {
                const choiceKey = makeChoiceKey(key, conflict.id);
                const selected = choices[choiceKey] || 'sync';
                const newerSide = getNewerSide(key, conflict);
                return (
                  <li className="conflictItem" key={ String(conflict.id) }>
                    <div className="conflictTitle">{ describeConflict(key, conflict) }</div>
                    <div className="conflictSplit" role="radiogroup" aria-label={ describeConflict(key, conflict) }>
                      <ConflictVersionCard
                        group={ key }
                        conflictId={ conflict.id }
                        side="sync"
                        value={ conflict.sync }
                        selected={ selected === 'sync' }
                        isNewer={ newerSide === 'sync' }
                        onSelect={ () => setChoice(key, conflict.id, 'sync') }
                      />
                      <ConflictVersionCard
                        group={ key }
                        conflictId={ conflict.id }
                        side="local"
                        value={ conflict.local }
                        selected={ selected === 'local' }
                        isNewer={ newerSide === 'local' }
                        onSelect={ () => setChoice(key, conflict.id, 'local') }
                      />
                    </div>
                  </li>
                );
              }) }
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
