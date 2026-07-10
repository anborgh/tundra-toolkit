import { useEffect, useRef, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';

import StickerPack from './stickerPack';

export default function () {
  const ref = useRef(null);

  const [ data, setData ] = useState<IStickerPack[]>([]);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);

  const handleSaveResult = (result: Awaited<ReturnType<typeof safeStorageSet>>) => {
    if (result.fallback) {
      setWarning('Память синхронизации переполнена. Стикеры сохранены только в этом браузере.');
    } else {
      setWarning(null);
    }
  };

  const handleSaveError = () => {
    setError('Не удалось сохранить стикеры: недостаточно памяти.');
  };

  const updateStickerPack = async (pack: IStickerPack) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === pack.id);
    newData[ index ] = { ...pack, updatedAt: Date.now() };
    setError(null);
    try {
      const result = await safeStorageSet({ stickerPack: newData });
      handleSaveResult(result);
      setData(newData);
    } catch (e) {
      handleSaveError();
    }
  }

  const addStickerPack = async () => {
    const newData = [ ...data ];
    const indexes = data.map(item => item.id);
    const newIndex = newData.length ? Math.max(...indexes) + 1 : 0;
    newData.push({
      id: newIndex,
      name: `New Pack ${ newIndex + 1 }`,
      items: [],
      updatedAt: Date.now(),
    });

    setError(null);
    try {
      const result = await safeStorageSet({ stickerPack: newData })
      handleSaveResult(result);
      setData(newData);
      ref.current.scrollIntoView();
    } catch (e) {
      handleSaveError();
    }
  }

  const removeStickerPack = async (packId: number) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === packId);
    if (index < 0) return;

    newData.splice(index, 1);

    setError(null);
    try {
      const result = await safeStorageSet({ stickerPack: newData });
      handleSaveResult(result);
      setData(newData);
    } catch (e) {
      handleSaveError();
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      const result = await safeStorageGet([ 'stickerPack' ]);

      const stickerPack = result.stickerPack || [];

      setData(stickerPack);
    }

    fetchData();
  }, []);

  return (
    <section className="stickerPackOptions">
      <div className="stickerPackOptionsHeader">
        <div>
          <h3>Стикеры</h3>
          <h6>Можно перетаскивать стикеры для сортировки</h6>
        </div>
        <div>
          <button className="button small" title="Добавить стикерпак" onClick={ addStickerPack }>Добавить</button>
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
        { data.map((pack => (
          <StickerPack
            key={ pack.id }
            onChange={ updateStickerPack }
            onRemove={ removeStickerPack }
            pack={ pack }
          />
        ))) }
        {!data.length && (
          <div className="emptyList">
            Список пока пуст. Создайте свой первый стикерпак по кнопке "Добавить".
          </div>
        )}
        <div ref={ ref }></div>
      </div>
    </section>
  )
}