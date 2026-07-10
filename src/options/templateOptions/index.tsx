import { useEffect, useMemo, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../utils/storage';

import './style.css';

const STORAGE_KEY = 'templates';

export default function TemplateOptions() {
  const [ templates, setTemplates ] = useState<ITemplate[]>([]);
  const [ loaded, setLoaded ] = useState(false);

  const nextId = useMemo(() => {
    const ids = templates.map(item => item.id);
    return ids.length ? Math.max(...ids) + 1 : 0;
  }, [ templates ]);

  useEffect(() => {
    const load = async () => {
      try {
        const storage = await safeStorageGet([ STORAGE_KEY ]);
        const stored = storage[ STORAGE_KEY ] || [];
        setTemplates(stored);
      } finally {
        setLoaded(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    safeStorageSet({ [ STORAGE_KEY ]: templates }).catch(() => {
      // Swallow the error: option UI state is still source of truth.
    });
  }, [ templates, loaded ]);

  useEffect(() => {
    const handleChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!changes[ STORAGE_KEY ]) return;
      const newValue = changes[ STORAGE_KEY ].newValue || [];
      setTemplates(newValue);
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
          <button className="button small" onClick={ addTemplate }>Добавить</button>
          { !!templates.length && (
            <button className="button small clear" onClick={ clearTemplates }>Очистить все</button>
          ) }
        </div>
      </div>

      { !templates.length && (
        <div className="emptyList">
          Пока нет ни одного шаблона. Добавьте новый или сохраните из всплывающего окна.
        </div>
      ) }

      <div className="templateOptionsList">
        { templates.map(template => (
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
        )) }
      </div>
    </section>
  );
}
