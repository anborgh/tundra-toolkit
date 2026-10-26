import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getStorageFallbacks,
  isStorageItemLocal,
  safeStorageGet,
  safeStorageSet,
  STORAGE_FALLBACKS_KEY,
  StorageFallbackMap,
} from '../../utils/storage';
import { MaskIcon } from '../../components/MaskIcon';
import { Modal } from '../../components/Modal';
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import downloadIcon from '../../assets/icons/download.svg';
import plusIcon from '../../assets/icons/plus.svg';
import searchIcon from '../../assets/icons/search.svg';
import pencilIcon from '../../assets/icons/pencil.svg';
import trashIcon from '../../assets/icons/trash.svg';
import cloudIcon from '../../assets/icons/cloud.svg';
import cloudOffIcon from '../../assets/icons/cloud-off.svg';
import { EnableBanner, EnableBannerProps } from '../enableBanner';
import { usePopupToast } from '../popupToast';
import { useConfirm } from '../../components/ConfirmDialog';
import {
  ItemEditor,
  TEMPLATE_BODY_PLACEHOLDER,
  TEMPLATE_NAME_PLACEHOLDER,
  TEMPLATE_REMOVE_CONFIRM,
  nextCollectionId,
  previewText,
} from '../../components/ItemEditor';

import '../../components/icon.css';

const STORAGE_KEY = 'templates';

type TemplateDraft = {
  name: string;
  content: string;
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

const formatDraftDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (date.toDateString() === new Date().toDateString()) {
    return `сегодня ${ date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }`;
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const draftMeta = (template: ITemplate) => {
  const length = template.content.length;
  const parts = [ `${ length.toLocaleString('ru-RU') } зн.` ];
  const date = formatDraftDate(template.updatedAt);
  if (date) parts.push(date);
  return parts.join(' · ');
};

export function Templates({ enableBanner = null }: { enableBanner?: EnableBannerProps | null }) {
  const { showError, clearToast } = usePopupToast();
  const confirmAction = useConfirm();
  const [templates, setTemplates] = useState<ITemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>({ name: '', content: '' });
  const [busy, setBusy] = useState(false);
  const [canUse, setCanUse] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fallbacks, setFallbacks] = useState<StorageFallbackMap>({});
  const [saving, setSaving] = useState(false);
  const skipPersist = useRef(true);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [query, setQuery] = useState('');

  const refreshFallbacks = () => {
    getStorageFallbacks()
      .then(setFallbacks)
      .catch(() => setFallbacks({}));
  };

  const nextId = useMemo(() => nextCollectionId(templates), [templates]);

  const statusView = useMemo(() => {
    if (error) return null;
    if (saving) {
      return { icon: loaderCircleIcon, text: 'Сохраняем…', tone: 'muted' as const, spin: true };
    }
    if (info) {
      return { icon: circleCheckIcon, text: info, tone: 'success' as const, spin: false };
    }
    if (busy) {
      return { icon: loaderCircleIcon, text: 'В процессе…', tone: 'muted' as const, spin: true };
    }
    return null;
  }, [error, info, busy, saving]);

  const persistTemplates = async (next: ITemplate[]) => {
    const result = await safeStorageSet({ [ STORAGE_KEY ]: next });
    refreshFallbacks();
    setError(null);
    if (result.fallback) {
      setInfo('В Chrome Sync не хватило места. Часть черновиков или все они остались только в этом браузере.');
    }
    return result;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const storage = await safeStorageGet([ STORAGE_KEY ]);
        const stored = storage[ STORAGE_KEY ] || [];
        setTemplates(stored);
        refreshFallbacks();
      } catch (e) {
        setError('Не удалось загрузить черновики');
        showError('Не удалось загрузить черновики');
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }

    let alive = true;
    setSaving(true);
    persistTemplates(templates)
      .then(result => {
        if (!alive) return;
        if (!result.fallback) setInfo(null);
      })
      .catch(() => {
        if (!alive) return;
        setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
        showError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      })
      .finally(() => {
        if (alive) setSaving(false);
      });

    return () => {
      alive = false;
    };
  }, [templates, loaded]);

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

  useEffect(() => {
    const checkCanUse = async () => {
      try {
        const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_templates_can_use' });
        setCanUse(!!resp?.canUse);
      } catch (e) {
        setCanUse(false);
      }
    };

    checkCanUse();
  }, []);

  const resetInfo = () => {
    setError(null);
    setInfo(null);
    clearToast();
  };

  const openCreateTemplate = () => {
    resetInfo();
    setDraft({ name: `Черновик ${ nextId + 1 }`, content: '' });
    setCreatingTemplate(true);
  };

  const closeCreateTemplate = () => {
    setCreatingTemplate(false);
    setDraft({ name: '', content: '' });
  };

  // Only written to storage on Save — Cancel/Escape/backdrop leaves nothing behind.
  const handleCreateTemplate = async () => {
    const newTemplate: ITemplate = {
      id: nextId,
      name: draft.name.trim(),
      content: draft.content,
      updatedAt: Date.now(),
    };
    const next = [ ...templates, newTemplate ];
    skipPersist.current = true;
    setSaving(true);
    try {
      const result = await persistTemplates(next);
      setTemplates(next);
      setCreatingTemplate(false);
      setDraft({ name: '', content: '' });
      if (!result.fallback) setInfo('Сохранено');
    } catch (e) {
      skipPersist.current = false;
      setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      showError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (template: ITemplate) => {
    resetInfo();
    setEditingId(template.id);
    setDraft({ name: template.name, content: template.content });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ name: '', content: '' });
  };

  const saveEdit = async (templateId: number) => {
    const next = templates.map(item => item.id === templateId ? {
      ...item,
      name: draft.name.trim(),
      content: draft.content,
      updatedAt: Date.now(),
    } : item);
    skipPersist.current = true;
    setSaving(true);
    try {
      const result = await persistTemplates(next);
      setTemplates(next);
      setEditingId(null);
      setDraft({ name: '', content: '' });
      if (!result.fallback) setInfo('Сохранено');
    } catch (e) {
      skipPersist.current = false;
      setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      showError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (templateId: number) => {
    const next = templates.filter(item => item.id !== templateId);
    skipPersist.current = true;
    setSaving(true);
    try {
      await persistTemplates(next);
      setTemplates(next);
      if (editingId === templateId) cancelEdit();
    } catch (e) {
      skipPersist.current = false;
      setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      showError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (templateId: number) => {
    resetInfo();
    const confirmed = await confirmAction({ message: TEMPLATE_REMOVE_CONFIRM, confirmLabel: 'Удалить', destructive: true });
    if (!confirmed) return;
    deleteTemplate(templateId);
  };

  const handleInsert = async (template: ITemplate) => {
    resetInfo();
    setBusy(true);
    try {
      const resp = await sendMessageToActiveTab({
        type: 'tundra_toolkit_templates_insert',
        content: template.content,
      });

      if (!resp?.success) {
        setError('Не удалось вставить текст. Откройте страницу с формой ответа.');
        showError('Не удалось вставить текст. Откройте страницу с формой ответа.');
      } else {
        setInfo('Вставлено в форму ответа');
      }
    } catch (e) {
      setError('Не удалось вставить: нет связи со страницей');
      showError('Не удалось вставить: нет связи со страницей');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveFromForm = async () => {
    resetInfo();
    setBusy(true);
    try {
      const resp = await sendMessageToActiveTab({ type: 'tundra_toolkit_templates_get' });
      if (!resp?.success) {
        setError('Не удалось получить текст из формы. Откройте страницу с формой ответа.');
        showError('Не удалось получить текст из формы. Откройте страницу с формой ответа.');
        return;
      }

      const content = resp.content || '';
      if (content.trim() === '') {
        setError('Текст пустой');
        showError('Текст пустой');
        return;
      }
      const name = resp.name || content.trim().split('\n').shift() || `Черновик ${ nextId + 1 }`;

      setTemplates(prev => [
        ...prev,
        {
          id: nextId,
          name: name.slice(0, 60),
          content,
          updatedAt: Date.now(),
        }
      ]);
      setInfo('Черновик сохранён');
    } catch (e) {
      setError('Не удалось связаться со страницей');
      showError('Не удалось связаться со страницей');
    } finally {
      setBusy(false);
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = normalizedQuery
    ? templates.filter(item => `${ item.name }\n${ item.content }`.toLowerCase().includes(normalizedQuery))
    : templates;

  return (
    <div class="draftsTab">
      <h2 class="sr-only">Черновики</h2>

      { enableBanner && (
        <EnableBanner { ...enableBanner } title="Вставлять черновики прямо в форму ответа?" />
      ) }

      <div class="draftsActions">
        <button
          class="button primary"
          type="button"
          onClick={ handleSaveFromForm }
          disabled={ busy || saving || canUse === false }
          title={ canUse === false ? 'Сначала откройте страницу с формой ответа' : 'Сохранить текст из формы ответа под названием темы' }
        >
          <MaskIcon src={ downloadIcon } />
          Сохранить из формы
        </button>
        <button class="button" type="button" onClick={ openCreateTemplate } disabled={ saving }>
          <MaskIcon src={ plusIcon } />
          Пустой черновик
        </button>
      </div>

      { templates.length > 0 && (
        <div class="draftsToolbar">
          <label class="ttSearch">
            <MaskIcon src={ searchIcon } />
            <input
              type="search"
              placeholder="Поиск по названию и тексту"
              aria-label="Поиск по черновикам"
              value={ query }
              onInput={ event => setQuery((event.target as HTMLInputElement).value) }
            />
          </label>
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
      ) }

      { loaded && !templates.length && (
        <div class="emptyList">
          Черновиков пока нет. Сохраните текст из формы ответа или создайте пустой черновик.
        </div>
      ) }

      { templates.length > 0 && !visibleTemplates.length && (
        <div class="emptyList">Ничего не нашлось</div>
      ) }

      <ul class="draftList">
        { visibleTemplates.map(template => {
          const local = isStorageItemLocal(fallbacks, STORAGE_KEY, template.id);
          const empty = template.content.trim() === '';
          return (
            <li class="draftCard" key={ template.id }>
              <div class="draftCardHead">
                <h3 class="draftTitle" title={ template.name }>{ template.name }</h3>
                <span
                  class={ local ? 'localDot' : 'localDot is-sync' }
                  title={ local ? 'Сохранено только в этом браузере' : 'Хранится в Chrome Sync' }
                  style={ local ? undefined : { color: 'var(--tt-muted)' } }
                >
                  <MaskIcon src={ local ? cloudOffIcon : cloudIcon } />
                </span>
              </div>
              <div class={ `draftPreview ${ empty ? 'is-empty' : '' }` }>{ previewText(template.content) }</div>
              <div class="draftCardFoot">
                <span class="draftMeta">{ draftMeta(template) }</span>
                <button
                  class="button small icon-only ghost"
                  type="button"
                  onClick={ () => startEdit(template) }
                  title="Редактировать"
                  aria-label={ `Редактировать «${ template.name }»` }
                >
                  <MaskIcon src={ pencilIcon } />
                </button>
                <button
                  class="button small icon-only ghost"
                  type="button"
                  onClick={ () => removeTemplate(template.id) }
                  title="Удалить"
                  aria-label={ `Удалить «${ template.name }»` }
                >
                  <MaskIcon src={ trashIcon } />
                </button>
                <button
                  class="button small"
                  type="button"
                  disabled={ busy || saving || canUse === false || empty }
                  title={ canUse === false ? 'Сначала откройте страницу с формой ответа' : 'Вставить в форму ответа' }
                  onClick={ () => handleInsert(template) }
                >
                  Вставить
                </button>
              </div>
            </li>
          );
        }) }
      </ul>

      { editingId != null && (
        <Modal title="Редактировать черновик" onClose={ cancelEdit }>
          <ItemEditor
            name={ draft.name }
            body={ draft.content }
            namePlaceholder={ TEMPLATE_NAME_PLACEHOLDER }
            bodyPlaceholder={ TEMPLATE_BODY_PLACEHOLDER }
            bodyRows={ 6 }
            onNameChange={ value => setDraft({ ...draft, name: value }) }
            onBodyChange={ value => setDraft({ ...draft, content: value }) }
            onSave={ () => saveEdit(editingId) }
            onCancel={ cancelEdit }
            onRemove={ () => {
              resetInfo();
              deleteTemplate(editingId);
            } }
            onInvalid={ showError }
            removeConfirm={ TEMPLATE_REMOVE_CONFIRM }
          />
        </Modal>
      ) }

      { creatingTemplate && (
        <Modal title="Новый черновик" onClose={ closeCreateTemplate }>
          <ItemEditor
            name={ draft.name }
            body={ draft.content }
            namePlaceholder={ TEMPLATE_NAME_PLACEHOLDER }
            bodyPlaceholder={ TEMPLATE_BODY_PLACEHOLDER }
            bodyRows={ 6 }
            onNameChange={ value => setDraft({ ...draft, name: value }) }
            onBodyChange={ value => setDraft({ ...draft, content: value }) }
            onSave={ handleCreateTemplate }
            onCancel={ closeCreateTemplate }
            onInvalid={ showError }
          />
        </Modal>
      ) }
    </div>
  );
}
