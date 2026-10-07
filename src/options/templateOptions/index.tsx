import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCollectionLocations,
  ItemLocation,
  safeStorageGet,
  safeStorageSet,
  setItemCloudPinned,
  STORAGE_FALLBACKS_KEY,
} from '../../utils/storage';
import { CloudSyncButton } from '../../components/CloudSyncButton';
import { MaskIcon } from '../../components/MaskIcon';
import plusIcon from '../../assets/icons/plus.svg';
import searchIcon from '../../assets/icons/search.svg';
import cloudOffIcon from '../../assets/icons/cloud-off.svg';
import { useConfirm } from '../../components/ConfirmDialog';
import {
  ItemEditor,
  TEMPLATE_BODY_PLACEHOLDER,
  TEMPLATE_NAME_PLACEHOLDER,
  TEMPLATE_REMOVE_CONFIRM,
  nextCollectionId,
  previewText,
  StorageSavingStatus,
} from '../../components/ItemEditor';

import './style.css';

const STORAGE_KEY = 'templates';

type TemplateDraft = {
  name: string;
  content: string;
};

export default function TemplateOptions() {
  const confirmAction = useConfirm();
  const [ templates, setTemplates ] = useState<ITemplate[]>([]);
  const [ loaded, setLoaded ] = useState(false);
  const [ locations, setLocations ] = useState<Record<string, ItemLocation>>({});
  const [ cloudError, setCloudError ] = useState<string | null>(null);
  const [ error, setError ] = useState<string | null>(null);
  const [ editingId, setEditingId ] = useState<number | null>(null);
  const [ draft, setDraft ] = useState<TemplateDraft>({ name: '', content: '' });
  const [ saving, setSaving ] = useState(false);
  const skipPersist = useRef(true);
  const [ creating, setCreating ] = useState(false);
  const [ query, setQuery ] = useState('');

  const nextId = useMemo(() => nextCollectionId(templates), [ templates ]);

  const refreshLocations = () => {
    getCollectionLocations('templates')
      .then(setLocations)
      .catch(() => setLocations({}));
  };

  const persistTemplates = async (next: ITemplate[]) => {
    await safeStorageSet({ [ STORAGE_KEY ]: next });
    refreshLocations();
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
    if (skipPersist.current) {
      skipPersist.current = false;
      return;
    }

    let alive = true;
    setSaving(true);
    persistTemplates(templates)
      .catch(() => {
        if (!alive) return;
        setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      })
      .finally(() => {
        if (alive) setSaving(false);
      });

    return () => {
      alive = false;
    };
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
    setCreating(false);
    setEditingId(template.id);
    setDraft({ name: template.name, content: template.content });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ name: '', content: '' });
  };

  const openCreateTemplate = () => {
    setError(null);
    setEditingId(null);
    setDraft({ name: `Черновик ${ nextId + 1 }`, content: '' });
    setCreating(true);
  };

  const closeCreateTemplate = () => {
    setCreating(false);
    setDraft({ name: '', content: '' });
  };

  // Only written on Save — Cancel/Escape/backdrop closes the modal and
  // leaves storage untouched (no phantom empty template).
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
      await persistTemplates(next);
      setTemplates(next);
      setCreating(false);
      setEditingId(newTemplate.id);
      setError(null);
    } catch (e) {
      skipPersist.current = false;
      setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
      throw e;
    } finally {
      setSaving(false);
    }
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
      await persistTemplates(next);
      setTemplates(next);
      setError(null);
    } catch (e) {
      skipPersist.current = false;
      setError('Не удалось сохранить черновики: в Chrome Sync не хватило места.');
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
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async (templateId: number) => {
    const confirmed = await confirmAction({ message: TEMPLATE_REMOVE_CONFIRM, confirmLabel: 'Удалить', destructive: true });
    if (!confirmed) return;
    deleteTemplate(templateId);
  };

  const clearTemplates = async () => {
    const confirmed = await confirmAction({
      message: 'Очистить все черновики? После удаления восстановить их нельзя.',
      confirmLabel: 'Очистить',
      destructive: true,
    });
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
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = normalizedQuery
    ? templates.filter(item => `${ item.name }\n${ item.content }`.toLowerCase().includes(normalizedQuery))
    : templates;
  const editingTemplate = editingId != null ? templates.find(item => item.id === editingId) || null : null;
  const editingDirty = !!editingTemplate
    && (draft.name !== editingTemplate.name || draft.content !== editingTemplate.content);

  return (
    <section className="templateOptions">
      <div className="templateOptionsHeader">
        <div>
          <h2>Черновики</h2>
          <p className="optionsSectionLead">Не храните здесь пароли, коды и личную переписку. Удалённое не восстановить.</p>
        </div>
        <div className="templateOptionsActions">
          <StorageSavingStatus saving={ saving } />
          { !!templates.length && (
            <button className="button outlineDanger" disabled={ saving } onClick={ clearTemplates }>Очистить все</button>
          ) }
          <button className="button primary" disabled={ saving } onClick={ openCreateTemplate }>
            <MaskIcon src={ plusIcon } />
            Новый черновик
          </button>
        </div>
      </div>

      { notice && (
        <div className="text-error optionsNotice">
          { notice }
        </div>
      ) }

      { loaded && !templates.length && !creating && (
        <div className="emptyList">
          Пока нет ни одного черновика. Создайте новый или сохраните текст из формы ответа в окне расширения.
        </div>
      ) }

      { (templates.length > 0 || creating) && (
        <div className="templateSplit">
          <section className="templateListPane" aria-label="Список черновиков">
            <label className="ttSearch">
              <MaskIcon src={ searchIcon } />
              <input
                type="search"
                placeholder="Поиск"
                aria-label="Поиск по черновикам"
                value={ query }
                onInput={ event => setQuery((event.target as HTMLInputElement).value) }
              />
            </label>
            { !visibleTemplates.length && (
              <p className="templateListEmpty">Ничего не нашлось</p>
            ) }
            <ul className="templateList">
              { visibleTemplates.map(template => {
                const location = locations[String(template.id)] || 'local';
                const meta = [ `${ template.content.length.toLocaleString('ru-RU') } зн.` ];
                if (template.updatedAt) meta.push(formatDate(template.updatedAt));
                return (
                  <li key={ template.id }>
                    <button
                      type="button"
                      className="templateListItem"
                      aria-current={ editingId === template.id ? 'true' : undefined }
                      onClick={ () => startEdit(template) }
                    >
                      <span className="templateListName">{ template.name }</span>
                      <span className="templateListMeta">
                        { meta.join(' · ') }
                        { location !== 'sync' && (
                          <MaskIcon src={ cloudOffIcon } class="templateListLocal" />
                        ) }
                      </span>
                    </button>
                  </li>
                );
              }) }
            </ul>
          </section>

          <section className="templateEditorPane" aria-label="Редактор">
            { creating ? (
              <>
                <h3 className="templateEditorTitle">Новый черновик</h3>
                <ItemEditor
                  name={ draft.name }
                  body={ draft.content }
                  namePlaceholder={ TEMPLATE_NAME_PLACEHOLDER }
                  bodyPlaceholder={ TEMPLATE_BODY_PLACEHOLDER }
                  bodyRows={ 14 }
                  onNameChange={ value => setDraft({ ...draft, name: value }) }
                  onBodyChange={ value => setDraft({ ...draft, content: value }) }
                  onSave={ handleCreateTemplate }
                  onCancel={ closeCreateTemplate }
                  onInvalid={ setError }
                  showLabels
                />
              </>
            ) : editingTemplate ? (
              <>
                <div className="templateEditorMeta">
                  <CloudSyncButton
                    location={ locations[String(editingTemplate.id)] || 'local' }
                    onToggle={ () => toggleCloud(editingTemplate.id) }
                  />
                  <span className="text-secondary">
                    { `${ draft.content.length.toLocaleString('ru-RU') } знаков` }
                    { editingTemplate.updatedAt ? ` · обновлено ${ formatDate(editingTemplate.updatedAt) }` : '' }
                  </span>
                </div>
                <ItemEditor
                  key={ editingTemplate.id }
                  name={ draft.name }
                  body={ draft.content }
                  namePlaceholder={ TEMPLATE_NAME_PLACEHOLDER }
                  bodyPlaceholder={ TEMPLATE_BODY_PLACEHOLDER }
                  bodyRows={ 14 }
                  onNameChange={ value => setDraft({ ...draft, name: value }) }
                  onBodyChange={ value => setDraft({ ...draft, content: value }) }
                  onSave={ () => saveEdit(editingTemplate.id) }
                  onCancel={ cancelEdit }
                  onRemove={ () => deleteTemplate(editingTemplate.id) }
                  onInvalid={ setError }
                  removeConfirm={ TEMPLATE_REMOVE_CONFIRM }
                  guardUnload={ editingDirty }
                  cancelLabel="Закрыть"
                  showLabels
                />
              </>
            ) : (
              <div className="templateEditorEmpty">
                Выберите черновик слева, чтобы прочитать или изменить его.
              </div>
            ) }
          </section>
        </div>
      ) }
    </section>
  );
}
