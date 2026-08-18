import './itemEditor.css';

type ItemEditorProps = {
  name: string;
  body: string;
  namePlaceholder?: string;
  bodyPlaceholder?: string;
  bodyRows?: number;
  onNameChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  onInvalid?: (message: string) => void;
  removeConfirm?: string;
};

export const PACK_NAME_PLACEHOLDER = 'Название';
export const PACK_BODY_PLACEHOLDER = 'Прямые ссылки на картинки — по одной на строку';
export const TEMPLATE_NAME_PLACEHOLDER = 'Название';
export const TEMPLATE_BODY_PLACEHOLDER = 'Текст, BBCode или HTML';
export const PACK_REMOVE_CONFIRM = 'Удалить стикерпак? После удаления восстановить его нельзя.';
export const TEMPLATE_REMOVE_CONFIRM = 'Удалить черновик или шаблон? После удаления восстановить его нельзя.';

export function nextCollectionId(items: { id: number }[]) {
  const ids = items.map(item => item.id);
  return ids.length ? Math.max(...ids) + 1 : 0;
}

export function previewText(content: string, emptyLabel = 'Пустой шаблон') {
  if (!content) return emptyLabel;
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.length > 140 ? `${ cleaned.slice(0, 140) }…` : cleaned;
}

export function ItemEditor({
  name,
  body,
  namePlaceholder = 'Название',
  bodyPlaceholder,
  bodyRows = 8,
  onNameChange,
  onBodyChange,
  onSave,
  onCancel,
  onRemove,
  onInvalid,
  removeConfirm,
}: ItemEditorProps) {
  const handleSave = (event: Event) => {
    event.preventDefault();
    if (!name.trim()) {
      onInvalid?.('Укажите название');
      return;
    }
    onSave();
  };

  const handleRemove = () => {
    if (!onRemove) return;
    if (removeConfirm && !confirm(removeConfirm)) return;
    onRemove();
  };

  return (
    <form className="itemEditor" onSubmit={ handleSave }>
      <input
        type="text"
        value={ name }
        onInput={ event => onNameChange((event.target as HTMLInputElement).value) }
        placeholder={ namePlaceholder }
      />
      <textarea
        rows={ bodyRows }
        value={ body }
        onInput={ event => onBodyChange((event.target as HTMLTextAreaElement).value) }
        placeholder={ bodyPlaceholder }
      />
      <div className="itemEditorActions">
        <button type="submit" className="button small success">Сохранить</button>
        <button type="button" className="button small" onClick={ onCancel }>Отмена</button>
        { onRemove && (
          <button type="button" className="button small clear" onClick={ handleRemove }>
            Удалить
          </button>
        ) }
      </div>
    </form>
  );
}
