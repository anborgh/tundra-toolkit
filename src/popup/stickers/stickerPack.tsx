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
  onSave: (pack: IStickerPack) => void;
  onRemove: (packId: number) => void;
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

  const handleStickerClick = async (event) => {
    const src = event?.target?.src;
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
        />
      </div>
    );
  }

  return (
    <div class="stickerPack">
      <div class="stickerPackHeader">
        { titleImg && (
          <div
            className="stickerPackTitleIcon"
            style={ `--bg-image: url(${ titleImg });` }
            onClick={ handleTitleClick }
          ></div>
        ) }
        <div class="stickerPackTitle" onClick={ handleTitleClick }>
          <div class="stickerPackTitleText">{ pack.name }</div>
          { localOnly && (
            <span
              className="storageLocalBadge"
              title="Сохранено только в этом браузере"
            >
              локально
            </span>
          ) }
        </div>
        <div className="stickerPackTitleActions">
          <button className="button small icon-only" onClick={ handleEditPack } title="Редактировать стикерпак">
            <MaskIcon src={ EditIcon } />
          </button>
        </div>
      </div>
      { opened && (
        <div class="stickerPackContent">
          { visibleStickers.map(sticker => (
            <div class="stickerItem" key={ sticker }>
              <img src={ sticker } onClick={ handleStickerClick } />
            </div>
          )) }
        </div>
      ) }
    </div>
  );
}
