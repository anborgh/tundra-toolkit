import { useEffect, useMemo, useState } from 'react';
import {
  getCollectionLocations,
  ItemLocation,
  safeStorageGet,
  safeStorageSet,
  setItemCloudPinned,
  STORAGE_FALLBACKS_KEY,
} from '../../utils/storage';
import { CloudSyncButton } from '../../components/CloudSyncButton';

import './style.css';

const STORAGE_KEY = 'templates';

export default function TemplateOptions() {
  const [ templates, setTemplates ] = useState<ITemplate[]>([]);
  const [ loaded, setLoaded ] = useState(false);
  const [ locations, setLocations ] = useState<Record<string, ItemLocation>>({});
  const [ cloudError, setCloudError ] = useState<string | null>(null);

  const nextId = useMemo(() => {
    const ids = templates.map(item => item.id);
    return ids.length ? Math.max(...ids) + 1 : 0;
  }, [ templates ]);

  const refreshLocations = () => {
    getCollectionLocations('templates')
      .then(setLocations)
      .catch(() => setLocations({}));
  };

  useEffect(() => {
    const load = async () => {
      try {
        const storage = await safeStorageGet([ STORAGE_KEY ]);
        const stored = storage[ STORAGE_KEY ] || [];
        setTemplates(stored);
        refreshLocations();
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    safeStorageSet({ [ STORAGE_KEY ]: templates })
      .then(() => refreshLocations())
      .catch(() => {});
  }, [ templates, loaded ]);

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

  const addTemplate = () => {
    setTemplates(prev => [
      ...prev,
      {
        id: nextId,
        name: `Шаблон ${ nextId + 1 }`,
        content: '',
        updatedAt: Date.now(),
      }
    ]);
  };

  const updateTemplate = (templateId: number, patch: Partial<ITemplate>) => {
    setTemplates(prev => prev.map(item => item.id === templateId ? {
      ...item,
      ...patch,
      updatedAt: Date.now(),
    } : item));
  };

  const removeTemplate = (templateId: number) => {
    const confirmed = confirm('Удалить шаблон? Действие нельзя отменить.');
    if (!confirmed) return;
    setTemplates(prev => prev.filter(item => item.id !== templateId));
  };

  const clearTemplates = () => {
    const confirmed = confirm('Очистить все шаблоны? Действие нельзя отменить.');
    if (!confirmed) return;
    setTemplates([]);
  };

  const toggleCloud = async (templateId: number) => {
    const current = locations[String(templateId)] || 'local';
    const result = await setItemCloudPinned('templates', templateId, current !== 'localPinned');
    setLocations(prev => ({ ...prev, [String(templateId)]: result.location }));
    setCloudError(result.error || null);
  };

  const formatDate = (value?: number) => {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value));
    } catch {
      return '';
    }
  };

  return (
    <section className="templateOptions">
      <div className="templateOptionsHeader">
        <div>
          <h3>Шаблоны</h3>
          <h6>Глобальные черновики для вставки в #main-reply</h6>
        </div>
        <div className="templateOptionsActions">
          <button className="button small primary" onClick={ addTemplate }>Добавить</button>
          { !!templates.length && (
            <button className="button small clear" onClick={ clearTemplates }>Очистить все</button>
          ) }
        </div>
      </div>

      { cloudError && (
        <div className="text-error" style={{ marginBottom: 8 }}>
          { cloudError }
        </div>
      ) }

      { !templates.length && (
        <div className="emptyList">
          Пока нет ни одного шаблона. Добавьте новый или сохраните из всплывающего окна.
        </div>
      ) }

      <div className="templateOptionsList">
        { templates.map(template => {
          const location = locations[String(template.id)] || 'local';
          return (
            <div className="templateOptionsItem" key={ template.id }>
              <div className="templateOptionsRow">
                <label>
                  Название
                  <input
                    type="text"
                    value={ template.name }
                    onInput={ (event: any) => updateTemplate(template.id, { name: event.target.value }) }
                  />
                </label>
                <div className="templateOptionsMeta">
                  <CloudSyncButton
                    location={ location }
                    onToggle={ () => toggleCloud(template.id) }
                  />
                  { template.updatedAt && (
                    <span className="text-secondary">Обновлено: { formatDate(template.updatedAt) }</span>
                  ) }
                </div>
              </div>
              <label className="templateOptionsLabel">
                Текст
                <textarea
                  rows={ 6 }
                  value={ template.content }
                  onInput={ (event: any) => updateTemplate(template.id, { content: event.target.value }) }
                  placeholder="BBCode или HTML, можно смешивать"
                />
              </label>
              <div className="templateOptionsFooter">
                <button className="button small clear" onClick={ () => removeTemplate(template.id) }>Удалить</button>
              </div>
            </div>
          );
        }) }
      </div>
    </section>
  );
}
