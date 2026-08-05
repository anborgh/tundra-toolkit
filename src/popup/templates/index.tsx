import { useEffect, useMemo, useState } from 'react';
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
import circleAlertIcon from '../../assets/icons/circle-alert.svg';

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
  const [templates, setTemplates] = useState<ITemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>({ name: '', content: '' });
  const [busy, setBusy] = useState(false);
  const [canUse, setCanUse] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [fallbacks, setFallbacks] = useState<StorageFallbackMap>({});

  const refreshFallbacks = () => {
    getStorageFallbacks()
      .then(setFallbacks)
      .catch(() => setFallbacks({}));
  };

  const nextId = useMemo(() => {
    const ids = templates.map(item => item.id);
    return ids.length ? Math.max(...ids) + 1 : 0;
  }, [templates]);

  const statusView = useMemo(() => {
    if (error) {
      return { icon: circleAlertIcon, text: error, tone: 'error' as const, spin: false };
    }
    if (info) {
      return { icon: circleCheckIcon, text: info, tone: 'success' as const, spin: false };
    }
    if (busy) {
      return { icon: loaderCircleIcon, text: 'В процессе…', tone: 'muted' as const, spin: true };
    }
    return null;
  }, [error, info, busy]);

  useEffect(() => {
    const load = async () => {
      try {
        const storage = await safeStorageGet([ STORAGE_KEY ]);
        const stored = storage[ STORAGE_KEY ] || [];
        setTemplates(stored);
        refreshFallbacks();
      } catch (e) {
        setError('Не удалось загрузить шаблоны');
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    safeStorageSet({ [ STORAGE_KEY ]: templates })
      .then(result => {
        refreshFallbacks();
        if (result.fallback) {
          setInfo('Память синхронизации переполнена. Часть шаблонов или все они сохранены только в этом браузере.');
        } else {
          setInfo(null);
        }
      })
      .catch(() => {
        setError('Не удалось сохранить шаблоны: недостаточно памяти.');
      });
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

  const saveEdit = (templateId: number) => {
    if (!draft.name.trim()) {
      setError('Укажите название шаблона');
      return;
    }

    setTemplates(prev => prev.map(item => item.id === templateId ? {
      ...item,
      name: draft.name.trim(),
      content: draft.content,
      updatedAt: Date.now(),
    } : item));
    setEditingId(null);
    setInfo('Сохранено');
  };

  const removeTemplate = (templateId: number) => {
    resetInfo();
    const confirmDelete = confirm('Удалить шаблон? Это действие необратимо.');
    if (!confirmDelete) return;

    setTemplates(prev => prev.filter(item => item.id !== templateId));
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
        setError('Не удалось вставить шаблон. Откройте подходящий форум.');
      } else {
        setInfo('Шаблон вставлен');
      }
    } catch (e) {
      setError('Не удалось вставить: нет связи со страницей');
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
        setError('Не удалось получить текст из формы. Откройте страницу форума с полем #main-reply.');
        return;
      }

      const content = resp.content || '';
      if (content.trim() === '') {
        setError('Текст пустой');
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
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = (content: string) => {
    if (!content) return 'Пустой шаблон';
    const cleaned = content.replace(/\s+/g, ' ').trim();
    return cleaned.length > 140 ? `${cleaned.slice(0, 140)}…` : cleaned;
  };

  return (
    <div class="templatesTab">
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
          <button class="button small" onClick={ addEmptyTemplate } title="Добавить пустой шаблон">
            Добавить пустой
          </button>
          <button
            class="button small primary"
            onClick={ handleSaveFromForm }
            disabled={ busy || canUse === false }
            title={ canUse === false ? 'Откройте страницу форума с полем ответа' : 'Сохранить текст из поля ответа' }
          >
            Сохранить из формы
          </button>
        </div>
      </div>

      { !templates.length && (
        <div class="emptyList">
          Шаблонов пока нет. Сохраните текст из формы или создайте пустой.
        </div>
      ) }

      <div class="templatesList">
        { templates.map(template => (
          <div class="templateCard" key={ template.id }>
            { editingId === template.id ? (
              <div class="templateEditor">
                <input
                  type="text"
                  value={ draft.name }
                  onInput={ event => setDraft({ ...draft, name: (event.target as HTMLInputElement).value }) }
                  placeholder="Название"
                />
                <textarea
                  rows={ 5 }
                  value={ draft.content }
                  onInput={ event => setDraft({ ...draft, content: (event.target as HTMLTextAreaElement).value }) }
                  placeholder="Текст шаблона"
                />
                <div class="templateCardActions">
                  <button class="button small success" onClick={ () => saveEdit(template.id) }>Сохранить</button>
                  <button class="button small" onClick={ cancelEdit }>Отмена</button>
                </div>
              </div>
            ) : (
              <div class="templateView">
                <div class="templateHeader">
                  <h5>{ template.name }</h5>
                  { isStorageItemLocal(fallbacks, STORAGE_KEY, template.id) && (
                    <span
                      className="storageLocalBadge"
                      title="Сохранено только на этом устройстве"
                    >
                      локально
                    </span>
                  ) }
                </div>
                <div class="templatePreview">{ renderPreview(template.content) }</div>
                <div class="templateCardActions">
                  <button
                    class="button small success"
                    disabled={ busy || canUse === false || template.content.trim() === '' }
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
