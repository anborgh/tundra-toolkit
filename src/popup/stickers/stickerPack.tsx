import { useEffect, useState } from 'react';
import { useBatchedItems } from '../../hooks/useBatchedItems';
import { MaskIcon } from '../../components/MaskIcon';
import EditIcon from '../../assets/icons/pencil.svg';
import { insertSticker } from './insertSticker';
import { usePopupToast } from '../popupToast';
import { checkImageURL } from '../../utils';
import {
  ItemEditor,
  PACK_BODY_PLACEHOLDER,
  PACK_NAME_PLACEHOLDER,
  PACK_REMOVE_CONFIRM,
} from '../../components/ItemEditor';

type PackProps = {
  pack: IStickerPack;
  opened: boolean;
  editing: boolean;
  onChange: (newActiveTab: number) => void;
  onEdit: (packId: number) => void;
  onCancelEdit: () => void;
  onSave: (pack: IStickerPack) => void | Promise<void>;
  onRemove: (packId: number) => void | Promise<void>;
  onStickerUsed?: (src: string) => void;
  localOnly?: boolean;
};

export function StickerPack({
  pack,
  onChange,
  opened,
  editing,
  onEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onStickerUsed,
  localOnly = false,
}: PackProps) {
  const [ titleImg, setTitleImg ] = useState('');
  const [ name, setName ] = useState(pack.name);
  const [ textItems, setTextItems ] = useState(pack.items.join('\n'));
  const visibleStickers = useBatchedItems(pack.items, opened && !editing);
  const { showError } = usePopupToast();

  const handleTitleClick = () => {
    onChange(pack.id);
  };

  const handleEditPack = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onEdit(pack.id);
  };

  const handleStickerClick = async (src: string) => {
    if (!src) return;

    onStickerUsed?.(src);
    await insertSticker(src, { onUnavailable: showError });
  };

  useEffect(() => {
    if (!pack.items.length) {
      setTitleImg('');
      return;
    }
    setTitleImg(pack.items[0]);
  }, [ pack ]);

  useEffect(() => {
    if (!editing) return;
    setName(pack.name);
    setTextItems(pack.items.join('\n'));
  }, [ editing, pack ]);

  if (editing) {
    return (
      <div class="stickerPack">
        <ItemEditor
          name={ name }
          body={ textItems }
          namePlaceholder={ PACK_NAME_PLACEHOLDER }
          bodyPlaceholder={ PACK_BODY_PLACEHOLDER }
          onNameChange={ setName }
          onBodyChange={ setTextItems }
          onSave={ () => onSave({
            ...pack,
            name: name.trim(),
            items: textItems.split('\n').filter(item => checkImageURL(item)),
          }) }
          onCancel={ onCancelEdit }
          onRemove={ () => onRemove(pack.id) }
          onInvalid={ showError }
          removeConfirm={ PACK_REMOVE_CONFIRM }
          bodySpellCheck={ false }
        />
      </div>
    );
  }

  return (
    <div class="stickerPack">
      <div class="stickerPackHeader">
        <button
          type="button"
          class="stickerPackToggle"
          onClick={ handleTitleClick }
          aria-expanded={ opened }
        >
          { titleImg && (
            <span
              className="stickerPackTitleIcon"
              style={ `--bg-image: url(${ titleImg });` }
            />
          ) }
          <span class="stickerPackTitle">
            <span class="stickerPackTitleText">{ pack.name }</span>
            { localOnly && (
              <span
                className="storageLocalBadge"
                title="Сохранено только в этом браузере"
              >
                локально
              </span>
            ) }
          </span>
        </button>
        <div className="stickerPackTitleActions">
          <button
            type="button"
            className="button small icon-only"
            onClick={ handleEditPack }
            title="Редактировать стикерпак"
            aria-label="Редактировать стикерпак"
          >
            <MaskIcon src={ EditIcon } />
          </button>
        </div>
      </div>
      { opened && (
        <div class="stickerPackContent">
          { visibleStickers.map(sticker => (
            <button
              type="button"
              class="stickerItem"
              key={ sticker }
              onClick={ () => handleStickerClick(sticker) }
              aria-label="Вставить стикер"
            >
              <img src={ sticker } alt="" />
            </button>
          )) }
        </div>
      ) }
    </div>
  );
}
