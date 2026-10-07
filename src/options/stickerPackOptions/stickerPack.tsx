import { useEffect, useRef, useState } from 'react';

import gripVerticalIcon from '../../assets/icons/grip-vertical.svg';
import pencilIcon from '../../assets/icons/pencil.svg';
import { MaskIcon } from '../../components/MaskIcon';
import { CloudSyncButton } from '../../components/CloudSyncButton';
import { useBatchedItems } from '../../hooks/useBatchedItems';
import type { ItemLocation } from '../../utils/storage';

import '../../components/icon.css';
import './style.css';

type Props = {
  pack: IStickerPack;
  onEdit: (packId: number) => void;
  onChange: (pack: IStickerPack) => void | Promise<void>;
  location?: ItemLocation;
  onCloudToggle?: () => void;
  reorderMode?: boolean;
};

export default function ({
  pack,
  onEdit,
  onChange,
  location = 'local',
  onCloudToggle,
  reorderMode = false,
}: Props) {
  const dragItem = useRef();
  const dragOverItem = useRef();

  const [ items, setItems ] = useState<IStickerPack['items']>(pack.items || []);
  const visibleStickers = useBatchedItems(items, true);

  useEffect(() => {
    setItems(pack.items || []);
  }, [ pack ]);

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

    setItems(newData);
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
    setItems(next);
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

  const handleEditPack = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onEdit(pack.id);
  };

  return (
    <div className={ `stickerList${ reorderMode ? ' reorderMode' : '' }` }>
      <div className="stickerListHeader">
        <div className="stickerListTitle">
          { reorderMode && (
            <span className="stickerListDragHandle" title="Перетащите стикерпак или используйте стрелки вверх и вниз">
              <MaskIcon src={ gripVerticalIcon } />
            </span>
          ) }
          <h3>{ pack.name }</h3>
          { onCloudToggle && (
            <CloudSyncButton location={ location } onToggle={ onCloudToggle } />
          ) }
        </div>
        { !reorderMode && (
          <div className="actions">
            <button
              type="button"
              className="button small icon-only"
              onClick={ handleEditPack }
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
