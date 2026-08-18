import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'react';
import {
  getCollectionLocations,
  ItemLocation,
  safeStorageGet,
  safeStorageSet,
  setItemCloudPinned,
  STORAGE_FALLBACKS_KEY,
} from '../../utils/storage';

import StickerPack from './stickerPack';
import { nextCollectionId, StorageSavingStatus } from '../../components/ItemEditor';

const STORAGE_KEY = 'stickerPack';

export default function () {
  const ref = useRef<HTMLDivElement>(null);
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);

  const [ data, setData ] = useState<IStickerPack[]>([]);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ locations, setLocations ] = useState<Record<string, ItemLocation>>({});
  const [ reorderMode, setReorderMode ] = useState(false);
  const [ editingId, setEditingId ] = useState<number | null>(null);
  const [ saving, setSaving ] = useState(false);

  const refreshLocations = () => {
    getCollectionLocations('stickerPack')
      .then(setLocations)
      .catch(() => setLocations({}));
  };

  const handleSaveResult = (result: Awaited<ReturnType<typeof safeStorageSet>>) => {
    refreshLocations();
    if (result.fallback) {
      setWarning('В Chrome Sync не хватило места. Часть стикеров или все они остались только в этом браузере.');
    } else {
      setWarning(null);
    }
  };

  const handleSaveError = () => {
    setError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
  };

  const writePacks = async (newData: IStickerPack[]) => {
    setError(null);
    setSaving(true);
    try {
      const result = await safeStorageSet({ stickerPack: newData });
      handleSaveResult(result);
      setData(newData);
      return result;
    } catch (e) {
      handleSaveError();
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const updateStickerPack = async (pack: IStickerPack) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === pack.id);
    newData[ index ] = { ...pack, updatedAt: Date.now() };
    await writePacks(newData);
  }

  const addStickerPack = async () => {
    const newIndex = nextCollectionId(data);
    const newData = [ ...data, {
      id: newIndex,
      name: `Стикерпак ${ newIndex + 1 }`,
      items: [],
      updatedAt: Date.now(),
    } ];

    try {
      await writePacks(newData);
    } catch {
      return;
    }
    setEditingId(newIndex);
    ref.current?.scrollIntoView();
  }

  const removeStickerPack = async (packId: number) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === packId);
    if (index < 0) return;

    newData.splice(index, 1);
    await writePacks(newData);
    if (editingId === packId) setEditingId(null);
  }

  const savePackOrder = async (newData: IStickerPack[]) => {
    await writePacks(newData);
  }

  const handlePackDragStart = (event: JSX.TargetedDragEvent<HTMLDivElement>) => {
    dragItem.current = event.currentTarget.dataset.index ?? null;
    event.currentTarget.classList.add('moving');
  }

  const handlePackDragEnter = (event: JSX.TargetedDragEvent<HTMLDivElement>) => {
    dragOverItem.current = event.currentTarget.dataset.index ?? null;

    event.currentTarget.classList.toggle(
      'hoveredTop',
      Number(dragItem.current) > Number(dragOverItem.current));
    event.currentTarget.classList.toggle(
      'hoveredBottom',
      Number(dragItem.current) < Number(dragOverItem.current));
  }

  const handlePackDragLeave = (event: JSX.TargetedDragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('hoveredTop');
    event.currentTarget.classList.remove('hoveredBottom');
  }

  const handlePackDrop = (event: JSX.TargetedDragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('moving');
    event.currentTarget.classList.remove('hoveredTop');
    event.currentTarget.classList.remove('hoveredBottom');

    if (
      typeof dragItem.current !== 'string'
      || typeof dragOverItem.current !== 'string'
      || dragItem.current === dragOverItem.current
    ) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const itemIndex = Number(dragItem.current);
    const targetIndex = Number(dragOverItem.current);
    const newData = [ ...data ];
    const [ moved ] = newData.splice(itemIndex, 1);
    newData.splice(targetIndex, 0, moved);

    dragItem.current = null;
    dragOverItem.current = null;

    savePackOrder(newData);
  }

  useEffect(() => {
    const fetchData = async () => {
      const result = await safeStorageGet([ STORAGE_KEY ]);

      const stickerPack = result.stickerPack || [];

      setData(stickerPack);
      refreshLocations();
    }

    fetchData();
  }, []);

  useEffect(() => {
    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'sync' && areaName !== 'local') return;
      if (changes[STORAGE_FALLBACKS_KEY] || changes['tt2/loc']) {
        refreshLocations();
      }
    };

    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  return (
    <section className="stickerPackOptions">
      <div className="stickerPackOptionsHeader">
        <div>
          <h3>Стикеры</h3>
          <h6>
            { reorderMode
              ? 'Перетащите стикерпаки выше или ниже'
              : 'Перетащите стикеры на нужные места' }
          </h6>
        </div>
        <div className="stickerPackOptionsActions">
          <StorageSavingStatus saving={ saving } />
          { data.length > 1 && (
            <button
              className={ `button small${ reorderMode ? ' success' : '' }` }
              title={ reorderMode ? 'Завершить изменение порядка' : 'Изменить порядок стикерпаков' }
              disabled={ saving }
              onClick={ () => {
                setEditingId(null);
                setReorderMode(prev => !prev);
              } }
            >
              { reorderMode ? 'Готово' : 'Изменить порядок' }
            </button>
          ) }
          { !reorderMode && (
            <button
              className="button small primary"
              title="Добавить стикерпак"
              disabled={ saving }
              onClick={ addStickerPack }
            >
              Добавить
            </button>
          ) }
        </div>
      </div>
      <div>
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
        { data.map((pack, index) => (
          <div
            key={ pack.id }
            className={ reorderMode ? 'stickerPackReorderItem' : undefined }
            draggable={ reorderMode }
            data-index={ index }
            onDragStart={ reorderMode ? handlePackDragStart : undefined }
            onDragEnter={ reorderMode ? handlePackDragEnter : undefined }
            onDragLeave={ reorderMode ? handlePackDragLeave : undefined }
            onDragEnd={ reorderMode ? handlePackDrop : undefined }
            onDragOver={ reorderMode ? (e) => e.preventDefault() : undefined }
          >
            <StickerPack
              onChange={ updateStickerPack }
              onRemove={ removeStickerPack }
              pack={ pack }
              editing={ editingId === pack.id }
              onEdit={ () => {
                setError(null);
                setEditingId(pack.id);
              } }
              onCancelEdit={ () => setEditingId(null) }
              onInvalid={ setError }
              location={ locations[String(pack.id)] || 'local' }
              onCloudToggle={ async () => {
                const current = locations[String(pack.id)] || 'local';
                const result = await setItemCloudPinned('stickerPack', pack.id, current !== 'localPinned');
                setLocations(prev => ({ ...prev, [String(pack.id)]: result.location }));
                setError(result.error || null);
              } }
              reorderMode={ reorderMode }
            />
          </div>
        )) }
        {!data.length && (
          <div className="emptyList">
            Список пока пуст. Создайте первый стикерпак кнопкой «Добавить».
          </div>
        )}
        <div ref={ ref }></div>
      </div>
    </section>
  )
}
