import { useEffect, useState } from 'react';
import {
  getStorageFallbacks,
  isStorageItemLocal,
  safeStorageGet,
  safeStorageSet,
  STORAGE_FALLBACKS_KEY,
  StorageFallbackMap,
} from '../../utils/storage';

import { StickerList } from './stickerList';
import { EditDialog } from './editDialog';
import { MaskIcon } from '../../components/MaskIcon';
import plusIcon from '../../assets/icons/plus.svg';

import '../../components/icon.css';
import './style.css';

export function Stickers() {

  const [ data, setData ] = useState<IStickerPack[]>([]);

  const [ loaded, setLoaded ] = useState<boolean>(false);
  const [ loading, setLoading ] = useState<boolean>(true);
  const [ error, setError ] = useState<boolean>(false);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ fallbacks, setFallbacks ] = useState<StorageFallbackMap>({});

  const [ editPack, setEditPack ] = useState<IStickerPack | null>(null);

  const refreshFallbacks = () => {
    getStorageFallbacks()
      .then(setFallbacks)
      .catch(() => setFallbacks({}));
  };

  const updateData = (newData: IStickerPack[]) => {
    setData(newData);
  }

  const addPack = () => {
    const indexes = data.map(item => item.id);
    const newIndex = data.length ? Math.max(...indexes) + 1 : 0;

    const newData = [ ...data, {
      id: newIndex,
      name: `New Pack ${ newIndex + 1 }`,
      items: [],
      updatedAt: Date.now(),
    } ]

    setData(newData);
  }

  const removePack = (packId: number) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === packId);
    newData.splice(index, 1);
    setData(newData);
  }

  const updateStickerPack = (packId: number, { name, items }: { name?: string, items?: string[] }) => {
    const newData = [ ...data ];
    const index = newData.findIndex(item => item.id === packId);
    newData[ index ].name = name || newData[ index ].name;
    newData[ index ].items = items || newData[ index ].items;
    newData[ index ].updatedAt = Date.now();
    setData(newData);
  }

  const onEditPack = (packId: number) => {
    const pack = data.find(item => item.id === packId);
    setEditPack(pack);
  }

  const handleSavePack = (newData: IStickerPack) => {
    updateStickerPack(newData.id, newData);
    setEditPack(null);
  }

  useEffect(() => {
    const fetchData = async () => {
      const result = await safeStorageGet([ 'stickerPack' ]);

      const stickerPack = result.stickerPack || [];

      updateData(stickerPack);
      refreshFallbacks();
    }

    fetchData()
      .then(() => {
        setError(false);
        setLoaded(true);
      })
      .catch(reason => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [])

  useEffect(() => {
    if (!loaded) return;

    const updateData = async () => {
      try {
        const result = await safeStorageSet({ stickerPack: data });
        refreshFallbacks();
        if (result.fallback) {
          setWarning('Память синхронизации переполнена. Часть стикеров или все они сохранены только в этом браузере.');
        } else {
          setWarning(null);
        }
      } catch (e) {
        setError(true);
        setWarning('Не удалось сохранить стикеры: недостаточно памяти.');
      }
    }

    updateData();

  }, [ data, loaded ]);

  useEffect(() => {
    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'sync' && areaName !== 'local') return;
      if (changes[STORAGE_FALLBACKS_KEY]) refreshFallbacks();
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <div class="stickerList_empty">
          Загружаем…
        </div>
      );
    }

    if (error) {
      return (
        <div class="stickerList_empty text-error">
          Не удалось загрузить список
        </div>
      );
    }

    if (!data.length) {
      return (
        <div class="stickerList_empty" onClick={ addPack }>
          <div class="stickerList_emptyIcon" />
          <div class="stickerList_emptyTitle">Список пуст</div>
          <div class="text-secondary">Нажмите, чтобы добавить первый пак</div>
        </div>
      );
    }

    return (
      <div class="stickerList">
        <StickerList
          data={ data }
          editStickerPack={ onEditPack }
          localIds={ data
            .filter(pack => isStorageItemLocal(fallbacks, 'stickerPack', pack.id))
            .map(pack => pack.id) }
        />
      </div>
    );
  };

  return (
    <div class="stickerTab">
      <div class="stickerHeader">
        <div class="stickerActions">
          <button class="button small" onClick={ addPack } title="Новый стикерпак">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MaskIcon src={ plusIcon } />
              Новый стикерпак
            </span>
          </button>
        </div>
      </div>

      <div class="stickerStatus">
        { loading && <span class="text-secondary">Загружаем…</span> }
        { error && <span class="text-error">Ошибка загрузки</span> }
        { !loading && !error && <span class="text-secondary">Паков: { data.length }</span> }
        { warning && <span class="text-secondary">{ warning }</span> }
      </div>

      <div class="stickerListWrapper">
        { renderContent() }
      </div>

      <EditDialog
        pack={ editPack }
        close={ () => setEditPack(null) }
        onSave={ handleSavePack }
        onRemove={ removePack }
      />
    </div>
  )
}