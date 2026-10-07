import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getStorageFallbacks,
  isStorageItemLocal,
  safeStorageGet,
  safeStorageSet,
  STORAGE_FALLBACKS_KEY,
  StorageFallbackMap,
} from '../../utils/storage';

import { StickerList } from './stickerList';
import { StickerPack } from './stickerPack';
import { EnableBanner, EnableBannerProps } from '../enableBanner';
import { MaskIcon } from '../../components/MaskIcon';
import { Modal } from '../../components/Modal';
import plusIcon from '../../assets/icons/plus.svg';
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import { addRecentSticker, getRecentStickers, RECENT_STICKERS_KEY } from './recentStickers';
import { insertSticker } from './insertSticker';
import { usePopupToast } from '../popupToast';
import { checkImageURL } from '../../utils';
import {
  ItemEditor,
  nextCollectionId,
  PACK_BODY_PLACEHOLDER,
  PACK_NAME_PLACEHOLDER,
  PACK_REMOVE_CONFIRM,
} from '../../components/ItemEditor';

import '../../components/icon.css';
import './style.css';

// Resolves once the image at `url` actually loads, rejects on error/timeout.
// checkImageURL() only checks the extension — this catches dead links.
const verifyImageLoads = (url: string) => new Promise<void>((resolve, reject) => {
  const img = new Image();
  const timer = window.setTimeout(() => {
    cleanup();
    reject(new Error('timeout'));
  }, 6000);
  const cleanup = () => {
    window.clearTimeout(timer);
    img.onload = null;
    img.onerror = null;
  };
  img.onload = () => {
    cleanup();
    resolve();
  };
  img.onerror = () => {
    cleanup();
    reject(new Error('load_error'));
  };
  img.src = url;
});

export function Stickers({ enableBanner = null }: { enableBanner?: EnableBannerProps | null }) {

  const { showError } = usePopupToast();
  const [ data, setData ] = useState<IStickerPack[]>([]);
  const [ recentStickers, setRecentStickers ] = useState<string[]>([]);

  const [ loaded, setLoaded ] = useState<boolean>(false);
  const [ loading, setLoading ] = useState<boolean>(true);
  const [ error, setError ] = useState<boolean>(false);
  const [ warning, setWarning ] = useState<string | null>(null);
  const [ fallbacks, setFallbacks ] = useState<StorageFallbackMap>({});

  const [ editPackId, setEditPackId ] = useState<number | null>(null);
  const [ editDraft, setEditDraft ] = useState({ name: '', body: '' });
  const [ saving, setSaving ] = useState(false);
  const skipPersist = useRef(true);

  const [ creatingPack, setCreatingPack ] = useState(false);
  const [ createDraft, setCreateDraft ] = useState({ name: '', body: '' });

  const [ activePackId, setActivePackId ] = useState<number | null>(null);
  const [ addStickerUrl, setAddStickerUrl ] = useState('');
  const [ addStickerError, setAddStickerError ] = useState<string | null>(null);
  const [ addStickerChecking, setAddStickerChecking ] = useState(false);

  const statusView = useMemo(() => {
    if (error) return null;
    if (saving) {
      return {
        icon: loaderCircleIcon,
        text: 'Сохраняем…',
        tone: 'muted' as const,
        spin: true,
      };
    }
    if (warning) {
      return {
        icon: circleCheckIcon,
        text: warning,
        tone: 'success' as const,
        spin: false,
      };
    }
    if (loading) {
      return {
        icon: loaderCircleIcon,
        text: 'Загружаем…',
        tone: 'muted' as const,
        spin: true,
      };
    }
    return null;
  }, [ error, warning, loading, saving ]);

  const refreshFallbacks = () => {
    getStorageFallbacks()
      .then(setFallbacks)
      .catch(() => setFallbacks({}));
  };

  const updateData = (newData: IStickerPack[]) => {
    setData(newData);
  }

  const handleStickerUsed = (src: string) => {
    addRecentSticker(src)
      .then(setRecentStickers)
      .catch(() => {});
  };

  const handleRecentStickerClick = async (src: string) => {
    if (!src) return;

    handleStickerUsed(src);
    await insertSticker(src, { onUnavailable: showError });
  };

  const persistPacks = async (next: IStickerPack[]) => {
    const result = await safeStorageSet({ stickerPack: next });
    refreshFallbacks();
    if (result.fallback) {
      setWarning('В Chrome Sync не хватило места. Часть стикеров или все они остались только в этом браузере.');
    } else {
      setWarning(null);
    }
    return result;
  };

  const openCreatePack = () => {
    const newIndex = nextCollectionId(data);
    setCreateDraft({ name: `Стикерпак ${ newIndex + 1 }`, body: '' });
    setCreatingPack(true);
  };

  const closeCreatePack = () => setCreatingPack(false);

  // Pack only gets created (and persisted) on explicit Save. Cancel/Escape/
  // backdrop click in the modal just closes it — nothing is written.
  const handleCreatePack = async () => {
    const newIndex = nextCollectionId(data);
    const newPack: IStickerPack = {
      id: newIndex,
      name: createDraft.name.trim(),
      items: createDraft.body.split('\n').filter(item => checkImageURL(item)),
      updatedAt: Date.now(),
    };
    const next = [ ...data, newPack ];
    skipPersist.current = true;
    setSaving(true);
    try {
      await persistPacks(next);
      setData(next);
      setActivePackId(newPack.id);
      setCreatingPack(false);
    } catch (e) {
      skipPersist.current = false;
      showError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const removePack = async (packId: number) => {
    const next = data.filter(item => item.id !== packId);
    skipPersist.current = true;
    setSaving(true);
    try {
      await persistPacks(next);
      setData(next);
      if (editPackId === packId) setEditPackId(null);
    } catch (e) {
      skipPersist.current = false;
      showError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleSavePack = async (nextPack: IStickerPack) => {
    const next = data.map(item => item.id === nextPack.id
      ? { ...nextPack, updatedAt: Date.now() }
      : item);
    skipPersist.current = true;
    setSaving(true);
    try {
      await persistPacks(next);
      setData(next);
      setEditPackId(null);
    } catch (e) {
      skipPersist.current = false;
      showError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const openEditPack = (packId: number) => {
    const pack = data.find(item => item.id === packId);
    if (!pack) return;
    setEditDraft({ name: pack.name, body: pack.items.join('\n') });
    setEditPackId(packId);
  };

  const handleAddStickerSubmit = async (event: Event) => {
    event.preventDefault();
    if (activePackId == null || addStickerChecking) return;

    const url = addStickerUrl.trim();
    if (!checkImageURL(url)) {
      setAddStickerError('Нужна прямая ссылка на картинку: png, jpg, jpeg, gif, webp или bmp');
      return;
    }

    setAddStickerChecking(true);
    setAddStickerError(null);
    try {
      await verifyImageLoads(url);
    } catch (e) {
      setAddStickerError('Не удалось загрузить картинку по этой ссылке');
      setAddStickerChecking(false);
      return;
    }

    const pack = data.find(item => item.id === activePackId);
    if (!pack) {
      setAddStickerChecking(false);
      return;
    }

    const next = data.map(item => item.id === activePackId
      ? { ...item, items: [ ...item.items, url ], updatedAt: Date.now() }
      : item);
    skipPersist.current = true;
    setSaving(true);
    try {
      await persistPacks(next);
      setData(next);
      setAddStickerUrl('');
    } catch (e) {
      skipPersist.current = false;
      showError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
    } finally {
      setSaving(false);
      setAddStickerChecking(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const [ result, recent ] = await Promise.all([
        safeStorageGet([ 'stickerPack' ]),
        getRecentStickers(),
      ]);

      const stickerPack = result.stickerPack || [];

      updateData(stickerPack);
      setRecentStickers(recent);
      refreshFallbacks();
    }

    fetchData()
      .then(() => {
        setError(false);
        setLoaded(true);
      })
      .catch(reason => {
        setError(true);
        showError('Не удалось загрузить список');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [])

  useEffect(() => {
    if (!data.length) {
      if (activePackId !== null) setActivePackId(null);
      return;
    }
    if (activePackId === null || !data.some(pack => pack.id === activePackId)) {
      setActivePackId(data[0].id);
    }
  }, [ data ]);

  useEffect(() => {
    if (!loaded) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }

    let alive = true;
    setSaving(true);
    persistPacks(data)
      .catch(() => {
        if (!alive) return;
        showError('Не удалось сохранить стикеры: в Chrome Sync не хватило места.');
      })
      .finally(() => {
        if (alive) setSaving(false);
      });

    return () => {
      alive = false;
    };
  }, [ data, loaded ]);

  useEffect(() => {
    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[RECENT_STICKERS_KEY]) {
        const next = changes[RECENT_STICKERS_KEY].newValue;
        setRecentStickers(Array.isArray(next) ? next : []);
      }
      if (areaName !== 'sync' && areaName !== 'local') return;
      if (changes[STORAGE_FALLBACKS_KEY]) refreshFallbacks();
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const activePack = data.find(pack => pack.id === activePackId) || null;

  const renderContent = () => {
    if (loading) {
      return <div class="emptyList">Загружаем…</div>;
    }

    if (error) {
      return <div class="emptyList">Список недоступен</div>;
    }

    if (!data.length) {
      return (
        <button type="button" class="emptyList stickerEmptyCta" onClick={ openCreatePack }>
          <strong>Стикерпаков пока нет</strong>
          <span class="text-secondary">Нажмите, чтобы создать первый</span>
        </button>
      );
    }

    return (
      <>
        <StickerList
          data={ data }
          activeId={ activePackId }
          onSelect={ setActivePackId }
          onCreate={ openCreatePack }
          createDisabled={ saving }
        />
        { activePack && (
          <StickerPack
            key={ activePack.id }
            pack={ activePack }
            onEdit={ openEditPack }
            onStickerUsed={ handleStickerUsed }
            localOnly={ isStorageItemLocal(fallbacks, 'stickerPack', activePack.id) }
          />
        ) }
      </>
    );
  };

  return (
    <div class="stickerTab">
      <h2 class="sr-only">Стикеры</h2>
      <div class="stickerScroll">
        { enableBanner && (
          <EnableBanner { ...enableBanner } title="Вставлять стикеры прямо в форму ответа?" />
        ) }

        { !!recentStickers.length && (
          <section class="recentStickers">
            <div class="recentStickersHead">
              <h3 class="ttSectionLabel">Недавние</h3>
              { statusView && (
                <span
                  class={ `ttStatusIcon ttStatusIcon--${ statusView.tone }` }
                  title={ statusView.text }
                  aria-label={ statusView.text }
                  role="status"
                >
                  <MaskIcon src={ statusView.icon } class={ statusView.spin ? 'ttIconSpin' : '' } />
                </span>
              ) }
            </div>
            <div class="recentStickersList">
              { recentStickers.map(sticker => (
                <button type="button" class="stickerItem" key={ sticker } onClick={ () => handleRecentStickerClick(sticker) } aria-label="Вставить стикер">
                  <img src={ sticker } alt="" />
                </button>
              )) }
            </div>
          </section>
        ) }

        { !recentStickers.length && statusView && (
          <span
            class={ `ttStatusIcon ttStatusIcon--${ statusView.tone }` }
            title={ statusView.text }
            aria-label={ statusView.text }
            role="status"
          >
            <MaskIcon src={ statusView.icon } class={ statusView.spin ? 'ttIconSpin' : '' } />
          </span>
        ) }

        { renderContent() }
      </div>

      { activePack && (
        <form class="stickerAddBar" onSubmit={ handleAddStickerSubmit }>
          <label for="stickerAddUrl" class="stickerAddLabel">Добавить в «{ activePack.name }»</label>
          <div class="stickerAddRow">
            <input
              id="stickerAddUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellcheck={ false }
              placeholder="Прямая ссылка: png, jpg, gif, webp"
              value={ addStickerUrl }
              disabled={ addStickerChecking }
              aria-invalid={ addStickerError ? 'true' : undefined }
              aria-describedby="stickerAddHint"
              onInput={ (event) => {
                setAddStickerUrl((event.target as HTMLInputElement).value);
                setAddStickerError(null);
              } }
            />
            <button
              type="submit"
              class="button primary"
              disabled={ addStickerChecking || saving || !addStickerUrl.trim() }
            >
              { addStickerChecking && <MaskIcon src={ loaderCircleIcon } class="ttIconSpin" /> }
              { addStickerChecking ? 'Проверяем…' : 'Добавить' }
            </button>
          </div>
          <div id="stickerAddHint" class={ addStickerError ? 'stickerAddHint text-error' : 'stickerAddHint' }>
            { addStickerError }
          </div>
        </form>
      ) }

      { creatingPack && (
        <Modal title="Новый стикерпак" onClose={ closeCreatePack }>
          <ItemEditor
            name={ createDraft.name }
            body={ createDraft.body }
            namePlaceholder={ PACK_NAME_PLACEHOLDER }
            bodyPlaceholder={ PACK_BODY_PLACEHOLDER }
            onNameChange={ name => setCreateDraft(d => ({ ...d, name })) }
            onBodyChange={ body => setCreateDraft(d => ({ ...d, body })) }
            onSave={ handleCreatePack }
            onCancel={ closeCreatePack }
            onInvalid={ showError }
            bodySpellCheck={ false }
          />
        </Modal>
      ) }

      { editPackId != null && (
        <Modal title="Редактировать стикерпак" onClose={ () => setEditPackId(null) }>
          <ItemEditor
            name={ editDraft.name }
            body={ editDraft.body }
            namePlaceholder={ PACK_NAME_PLACEHOLDER }
            bodyPlaceholder={ PACK_BODY_PLACEHOLDER }
            onNameChange={ name => setEditDraft(d => ({ ...d, name })) }
            onBodyChange={ body => setEditDraft(d => ({ ...d, body })) }
            onSave={ () => handleSavePack({
              id: editPackId,
              name: editDraft.name.trim(),
              items: editDraft.body.split('\n').filter(item => checkImageURL(item)),
              updatedAt: Date.now(),
            }) }
            onCancel={ () => setEditPackId(null) }
            onRemove={ () => removePack(editPackId) }
            onInvalid={ showError }
            removeConfirm={ PACK_REMOVE_CONFIRM }
            bodySpellCheck={ false }
          />
        </Modal>
      ) }
    </div>
  )
}
