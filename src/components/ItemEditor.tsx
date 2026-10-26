import { useEffect, useState } from 'react';
import { MaskIcon } from './MaskIcon';
import { useConfirm } from './ConfirmDialog';
import loaderCircleIcon from '../assets/icons/loader-circle.svg';

import './icon.css';
import './itemEditor.css';

type ItemEditorProps = {
  name: string;
  body: string;
  namePlaceholder?: string;
  bodyPlaceholder?: string;
  bodyRows?: number;
  onNameChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  onRemove?: () => void | Promise<void>;
  onInvalid?: (message: string) => void;
  removeConfirm?: string;
  bodySpellCheck?: boolean;
  /** Ask before closing the page while the editor is open (default: true). */
  guardUnload?: boolean;
  cancelLabel?: string;
  /** Visible field labels instead of screen-reader-only ones. */
  showLabels?: boolean;
};

export const PACK_NAME_PLACEHOLDER = 'Название…';
export const PACK_BODY_PLACEHOLDER = 'https://example.com/image.png…';
export const TEMPLATE_NAME_PLACEHOLDER = 'Название…';
export const TEMPLATE_BODY_PLACEHOLDER = 'Текст, BBCode или HTML…';
export const PACK_REMOVE_CONFIRM = 'Удалить стикерпак? После удаления восстановить его нельзя.';
export const TEMPLATE_REMOVE_CONFIRM = 'Удалить черновик? После удаления восстановить его нельзя.';

export function nextCollectionId(items: { id: number }[]) {
  const ids = items.map(item => item.id);
  return ids.length ? Math.max(...ids) + 1 : 0;
}

export function previewText(content: string, emptyLabel = 'Пустой черновик') {
  if (!content) return emptyLabel;
  const cleaned = content.replace(/\s+/g, ' ').trim();
  return cleaned.length > 140 ? `${ cleaned.slice(0, 140) }…` : cleaned;
}

export function StorageSavingStatus({ saving }: { saving: boolean }) {
  if (!saving) return null;

  return (
    <span
      className="storageSaveStatus"
      title="Сохраняем в Chrome Storage…"
      aria-label="Сохраняем в Chrome Storage"
      role="status"
    >
      <MaskIcon src={ loaderCircleIcon } class="ttIconSpin" />
    </span>
  );
}

export function ItemEditor({
  name,
  body,
  namePlaceholder = 'Название…',
  bodyPlaceholder,
  bodyRows = 8,
  onNameChange,
  onBodyChange,
  onSave,
  onCancel,
  onRemove,
  onInvalid,
  removeConfirm,
  bodySpellCheck = true,
  guardUnload = true,
  cancelLabel = 'Отмена',
  showLabels = false,
}: ItemEditorProps) {
  const confirmAction = useConfirm();
  const [ saving, setSaving ] = useState(false);
  const nameLabel = namePlaceholder.replace(/…$/, '');
  const bodyLabel = bodyPlaceholder?.replace(/…$/, '') || 'Текст';

  useEffect(() => {
    if (!guardUnload) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [ guardUnload ]);

  const handleSave = async (event: Event) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      onInvalid?.('Укажите название');
      return;
    }
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove || saving) return;
    if (removeConfirm) {
      const confirmed = await confirmAction({ message: removeConfirm, confirmLabel: 'Удалить', destructive: true });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      await onRemove();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="itemEditor" aria-busy={ saving } onSubmit={ handleSave }>
      <label className="itemEditorField">
        <span className={ showLabels ? 'itemEditorLabel' : 'sr-only' }>{ nameLabel }</span>
        <input
          type="text"
          name="itemName"
          autoComplete="off"
          spellcheck={ false }
          value={ name }
          disabled={ saving }
          aria-label={ nameLabel }
          onInput={ event => onNameChange((event.target as HTMLInputElement).value) }
          placeholder={ namePlaceholder }
        />
      </label>
      <label className="itemEditorField">
        <span className={ showLabels ? 'itemEditorLabel' : 'sr-only' }>{ bodyLabel }</span>
        <textarea
          name="itemBody"
          autoComplete="off"
          spellcheck={ bodySpellCheck }
          rows={ bodyRows }
          value={ body }
          disabled={ saving }
          aria-label={ bodyLabel }
          onInput={ event => onBodyChange((event.target as HTMLTextAreaElement).value) }
          placeholder={ bodyPlaceholder }
        />
      </label>
      <div className="itemEditorActions">
        <button type="submit" className="button small success" disabled={ saving }>
          { saving && <MaskIcon src={ loaderCircleIcon } class="ttIconSpin" /> }
          { saving ? 'Сохранение…' : 'Сохранить' }
        </button>
        <button type="button" className="button small" disabled={ saving } onClick={ onCancel }>
          { cancelLabel }
        </button>
        { onRemove && (
          <button type="button" className="button small danger itemEditorRemove" disabled={ saving } onClick={ handleRemove }>
            Удалить
          </button>
        ) }
      </div>
    </form>
  );
}
