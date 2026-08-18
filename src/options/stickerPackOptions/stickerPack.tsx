import { useEffect, useRef, useState } from 'react';

import gripVerticalIcon from '../../assets/icons/grip-vertical.svg';
import pencilIcon from '../../assets/icons/pencil.svg';
import { MaskIcon } from '../../components/MaskIcon';
import { CloudSyncButton } from '../../components/CloudSyncButton';
import {
  ItemEditor,
  PACK_BODY_PLACEHOLDER,
  PACK_NAME_PLACEHOLDER,
  PACK_REMOVE_CONFIRM,
} from '../../components/ItemEditor';
import { useBatchedItems } from '../../hooks/useBatchedItems';
import { checkImageURL } from '../../utils';
import type { ItemLocation } from '../../utils/storage';

import '../../components/icon.css';
import './style.css';

type Props = {
  pack: IStickerPack;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onChange: (pack: IStickerPack) => void | Promise<void>;
  onRemove: (packId: number) => void | Promise<void>;
  onInvalid?: (message: string) => void;
  location?: ItemLocation;
  onCloudToggle?: () => void;
  reorderMode?: boolean;
};

export default function ({
  pack,
  editing,
  onEdit,
  onCancelEdit,
  onChange,
  onRemove,
  onInvalid,
  location = 'local',
  onCloudToggle,
  reorderMode = false,
}: Props) {
  const dragItem = useRef();
  const dragOverItem = useRef();

  const [ name, setName ] = useState(pack.name);
  const [ items, setItems ] = useState<IStickerPack['items']>(pack.items || []);
  const [ textItems, setTextItems ] = useState((pack.items || []).join('\n'));
  const visibleStickers = useBatchedItems(items, !editing);

  const savePack = async () => {
    const clearedItems = textItems.split('\n').filter(item => checkImageURL(item));

    await onChange({
      id: pack.id,
      name: name.trim(),
      items: clearedItems,
    });
    onCancelEdit();
  };

  const handleDragStart = event => {
    dragItem.current = event.currentTarget.dataset.index;
    event.currentTarget.classList.add('moving');
  };

  const handleDragEnter = event => {
    dragOverItem.current = event.currentTarget.dataset.index;

    event.currentTarget.classList.toggle(
      'hoveredLeft',
      Number(dragItem.current) > Number(dragOverItem.current));
    event.currentTarget.classList.toggle(
      'hoveredRight',
      Number(dragItem.current) < Number(dragOverItem.current));
  };

  const handleDragLeave = event => {
    event.currentTarget.classList.remove('hoveredLeft');
    event.currentTarget.classList.remove('hoveredRight');
  };

  const drop = event => {
    event.currentTarget.classList.remove('moving');
    if (
      typeof dragItem.current !== 'string'
      || typeof dragOverItem.current !== 'string'
      || dragItem.current === dragOverItem.current
    ) return;

    const newData = [ ...items ];
    const itemIndex = Number(dragItem.current);
    const targetIndex = Number(dragOverItem.current);

    newData.splice(itemIndex, 1);
    newData.splice(targetIndex, 0, items[ itemIndex ]);
    dragItem.current = null;
    dragOverItem.current = null;

    onChange({
      id: pack.id,
      name: pack.name,
      items: newData,
    });
  };

  const moveSticker = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [ ...items ];
    const [ moved ] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange({
      id: pack.id,
      name: pack.name,
      items: next,
    });
  };

  const handleStickerKeyDown = (event: { key: string; preventDefault: () => void }, index: number) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveSticker(index, -1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveSticker(index, 1);
    }
  };

  useEffect(() => {
    setName(pack.name || 'UNKNOWN');
    setItems(pack.items || []);
    setTextItems((pack.items || []).join('\n'));
  }, [ pack ]);

  if (editing && !reorderMode) {
    return (
      <div className="stickerList">
        <div className="stickerListEditor">
          <ItemEditor
            name={ name }
            body={ textItems }
            namePlaceholder={ PACK_NAME_PLACEHOLDER }
            bodyPlaceholder={ PACK_BODY_PLACEHOLDER }
            onNameChange={ setName }
            onBodyChange={ setTextItems }
            onSave={ savePack }
            onCancel={ () => {
              setName(pack.name);
              setTextItems((pack.items || []).join('\n'));
              onCancelEdit();
            } }
            onRemove={ () => onRemove(pack.id) }
            onInvalid={ onInvalid }
            removeConfirm={ PACK_REMOVE_CONFIRM }
            bodySpellCheck={ false }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={ `stickerList${ reorderMode ? ' reorderMode' : '' }` }>
      <div className="stickerListHeader">
        <div className="stickerListTitle">
          { reorderMode && (
            <span className="stickerListDragHandle" title="Перетащите стикерпак или используйте стрелки вверх и вниз">
              <MaskIcon src={ gripVerticalIcon } />
            </span>
          ) }
          <h3>{ name }</h3>
          { onCloudToggle && (
            <CloudSyncButton location={ location } onToggle={ onCloudToggle } />
          ) }
        </div>
        { !reorderMode && (
          <div className="actions">
            <button
              type="button"
              className="button small icon-only"
              onClick={ onEdit }
              title="Редактировать стикерпак"
              aria-label="Редактировать стикерпак"
            >
              <MaskIcon src={ pencilIcon } />
            </button>
          </div>
        ) }
      </div>
      { !reorderMode && (
        <div className="stickerListContent">
          { visibleStickers.map((sticker, index) => (
            <div
              onDragStart={ handleDragStart }
              onDragEnter={ handleDragEnter }
              onDragLeave={ handleDragLeave }
              onDragEnd={ drop }
              onKeyDown={ (event) => handleStickerKeyDown(event, index) }
              draggable
              tabIndex={ 0 }
              className="stickerItem"
              key={ sticker }
              data-index={ index }
              aria-label={ `Стикер ${ index + 1 } из ${ items.length }. Стрелки влево и вправо меняют порядок` }
            >
              <img src={ sticker } alt="" />
            </div>
          )) }
        </div>
      ) }
    </div>
  );
}
