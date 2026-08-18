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
import {
  ItemEditor,
  TEMPLATE_BODY_PLACEHOLDER,
  TEMPLATE_NAME_PLACEHOLDER,
  TEMPLATE_REMOVE_CONFIRM,
  nextCollectionId,
  previewText,
} from '../../components/ItemEditor';

import './style.css';

const STORAGE_KEY = 'templates';

type TemplateDraft = {
  name: string;
  content: string;
};

export default function TemplateOptions() {
  const [ templates, setTemplates ] = useState<ITemplate[]>([]);
  const [ loaded, setLoaded ] = useState(false);
  const [ locations, setLocations ] = useState<Record<string, ItemLocation>>({});
  const [ cloudError, setCloudError ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ editingId, setEditingId ] = useState<number | null>(null);
  const [ draft, setDraft ] = useState<TemplateDraft>({ name: '', content: '' });

  const nextId = useMemo(() => nextCollectionId(templates), [ templates ]);

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

  const startEdit = (template: ITemplate) => {
    setError(null);
    setEditingId(template.id);
    setDraft({ name: template.name, content: template.content });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ name: '', content: '' });
  };

  const addTemplate = () => {
    const name = `Шаблон ${ nextId + 1 }`;
    setTemplates(prev => [
      ...prev,
      {
        id: nextId,
        name,
        content: '',
        updatedAt: Date.now(),
      }
    ]);
    setEditingId(nextId);
    setDraft({ name, content: '' });
    setError(null);
  };

  const saveEdit = (templateId: number) => {
    setTemplates(prev => prev.map(item => item.id === templateId ? {
      ...item,
      name: draft.name.trim(),
      content: draft.content,
      updatedAt: Date.now(),
    } : item));
    cancelEdit();
    setError(null);
  };

  const deleteTemplate = (templateId: number) => {
    setTemplates(prev => prev.filter(item => item.id !== templateId));
    if (editingId === templateId) cancelEdit();
  };

  const removeTemplate = (templateId: number) => {
    if (!confirm(TEMPLATE_REMOVE_CONFIRM)) return;
    deleteTemplate(templateId);
  };

  const clearTemplates = () => {
    const confirmed = confirm('Очистить все черновики и шаблоны? После удаления восстановить их нельзя.');
    if (!confirmed) return;
    cancelEdit();
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

  const notice = error || cloudError;

  return (
    <section className="templateOptions">
      <div className="templateOptionsHeader">
        <div>
          <h3>Черновики</h3>
          <h6>Редактируйте названия и содержимое черновиков и шаблонов</h6>
        </div>
        <div className="templateOptionsActions">
          <button className="button small primary" onClick={ addTemplate }>Добавить</button>
          { !!templates.length && (
            <button className="button small clear" onClick={ clearTemplates }>Очистить все</button>
          ) }
        </div>
      </div>

      { notice && (
        <div className="text-error" style={{ marginBottom: 8 }}>
          { notice }
        </div>
      ) }

      { !templates.length && (
        <div className="emptyList">
          Пока нет ни одного черновика или шаблона. Добавьте новый или сохраните из окна расширения.
        </div>
      ) }

      <div className="templateOptionsList">
        { templates.map(template => {
          const location = locations[String(template.id)] || 'local';
          return (
            <div className="templateOptionsItem" key={ template.id }>
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
                  onRemove={ () => deleteTemplate(template.id) }
                  onInvalid={ setError }
                  removeConfirm={ TEMPLATE_REMOVE_CONFIRM }
                />
              ) : (
                <>
                  <div className="templateOptionsViewHeader">
                    <h5>{ template.name }</h5>
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
                  <div className="templateOptionsPreview">{ previewText(template.content) }</div>
                  <div className="templateOptionsFooter">
                    <button className="button small" onClick={ () => startEdit(template) }>Редактировать</button>
                    <button className="button small clear" onClick={ () => removeTemplate(template.id) }>Удалить</button>
                  </div>
                </>
              ) }
            </div>
          );
        }) }
      </div>
    </section>
  );
}
