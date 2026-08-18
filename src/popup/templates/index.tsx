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
import loaderCircleIcon from '../../assets/icons/loader-circle.svg';
import circleCheckIcon from '../../assets/icons/circle-check.svg';
import { usePopupToast } from '../popupToast';
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

export function Templates() {
  const { showError, clearToast } = usePopupToast();
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
      setInfo('В Chrome Sync не хватило места. Часть шаблонов или все они остались только в этом браузере.');
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
        setError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
        showError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
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

  const addEmptyTemplate = () => {
    resetInfo();
    setTemplates(prev => [
      ...prev,
      {
        id: nextId,
        name: `Шаблон ${ nextId + 1 }`,
        content: '',
        updatedAt: Date.now(),
      }
    ]);
    setEditingId(nextId);
    setDraft({ name: `Шаблон ${ nextId + 1 }`, content: '' });
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
      setError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
      showError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
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
      setError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
      showError('Не удалось сохранить шаблоны: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = (templateId: number) => {
    resetInfo();
    if (!confirm(TEMPLATE_REMOVE_CONFIRM)) return;
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
        setInfo('Шаблон вставлен');
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

  return (
    <div class="templatesTab">
      <h2 class="sr-only">Черновики</h2>
      <div class="templatesHeader">
        <div class="templatesActions">
          { statusView && (
            <span
              class={ `templatesStatus templatesStatus--${ statusView.tone }` }
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
          <button class="button small" onClick={ addEmptyTemplate } disabled={ saving } title="Добавить пустой шаблон">
            Добавить пустой
          </button>
          <button
            class="button small primary"
            onClick={ handleSaveFromForm }
            disabled={ busy || saving || canUse === false }
            title={ canUse === false ? 'Сначала откройте страницу с формой ответа' : 'Сохранить текст из формы ответа' }
          >
            Сохранить из формы
          </button>
        </div>
      </div>

      { !templates.length && (
        <div class="emptyList">
          Шаблонов и черновиков пока нет. Сохраните текст из формы или нажмите «Добавить пустой».
        </div>
      ) }

      <div class="templatesList">
        { templates.map(template => (
          <div class="templateCard" key={ template.id }>
            { editingId === template.id ? (
              <ItemEditor
                name={ draft.name }
                body={ draft.content }
                namePlaceholder={ TEMPLATE_NAME_PLACEHOLDER }
                bodyPlaceholder={ TEMPLATE_BODY_PLACEHOLDER }
                bodyRows={ 6 }
                onNameChange={ value => setDraft({ ...draft, name: value }) }
                onBodyChange={ value => setDraft({ ...draft, content: value }) }
                onSave={ () => saveEdit(template.id) }
                onCancel={ cancelEdit }
                onRemove={ () => {
                  resetInfo();
                  deleteTemplate(template.id);
                } }
                onInvalid={ showError }
                removeConfirm={ TEMPLATE_REMOVE_CONFIRM }
              />
            ) : (
              <div class="templateView">
                <div class="templateHeader">
                  <h3>{ template.name }</h3>
                  { isStorageItemLocal(fallbacks, STORAGE_KEY, template.id) && (
                    <span
                      className="storageLocalBadge"
                      title="Сохранено только в этом браузере"
                    >
                      локально
                    </span>
                  ) }
                </div>
                <div class="templatePreview">{ previewText(template.content) }</div>
                <div class="templateCardActions">
                  <button
                    class="button small success"
                    disabled={ busy || saving || canUse === false || template.content.trim() === '' }
                    onClick={ () => handleInsert(template) }
                  >
                    Вставить
                  </button>
                  <button class="button small" onClick={ () => startEdit(template) }>Редактировать</button>
                  <button class="button small clear" onClick={ () => removeTemplate(template.id) }>Удалить</button>
                </div>
              </div>
            ) }
          </div>
        )) }
      </div>
    </div>
  );
}
