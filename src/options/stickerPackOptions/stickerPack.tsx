import { useEffect, useRef, useState } from 'react';

import { useBatchedItems } from '../../hooks/useBatchedItems';
import { checkImageURL } from '../../utils';

import './style.css';

type Props = {
  pack: IStickerPack;
  onChange: (pack: IStickerPack) => void;
  onRemove: (packId: number) => void;
}

export default function ({ pack, onChange, onRemove }: Props) {
  const dragItem = useRef();
  const dragOverItem = useRef();

  const [ edit, setEdit ] = useState<boolean>(false);
  const [ name, setName ] = useState<string>('');
  const [ items, setItems ] = useState<IStickerPack['items']>([]);
  const [ textItems, setTextItems ] = useState<string>('');
  const visibleStickers = useBatchedItems(items, !edit);

  const handleNameChange = ({ target }) => {
    setName(target.value);
  }

  const handleItemsChange = ({ target }) => {
    setTextItems(target.value);
  }

  const showEditPack = () => setEdit(true);

  const hideEditPack = () => {
    setName(pack.name);
    setEdit(false);
  }

  const savePack = () => {
    const clearedItems = textItems.split('\n').filter(item => checkImageURL(item));

    onChange({
      id: pack.id,
      name,
      items: clearedItems,
    });
    setEdit(false);
  }

  const hideRemovePack = () => {
    const isConfirmed = confirm('Удалить стикерпак? Это необратимо.')

    if (!isConfirmed) return;

    onRemove(pack.id);
  }

  const handleDragStart = event => {
    dragItem.current = event.currentTarget.dataset.index;
    event.currentTarget.classList.add('moving');
  }

  const handleDragEnter = event => {
    dragOverItem.current = event.currentTarget.dataset.index;

    event.currentTarget.classList.toggle(
      'hoveredLeft',
      Number(dragItem.current) > Number(dragOverItem.current));
    event.currentTarget.classList.toggle(
      'hoveredRight',
      Number(dragItem.current) < Number(dragOverItem.current));
  }

  const handleDragLeave = event => {
    event.currentTarget.classList.remove('hoveredLeft');
    event.currentTarget.classList.remove('hoveredRight');
  }

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
    })
  }

  useEffect(() => {
    setName(pack.name || 'UNKNOWN');
    setItems(pack.items || []);
    setTextItems(pack?.items?.join('\n') || '');
  }, [ pack ]);

  return (
    <div className="stickerList">
      <div className="stickerListHeader">
        { edit ? (
          <div>
            <input type="text" value={ name } onChange={ handleNameChange }/>
          </div>
        ) : (
          <h4>{ name }</h4>
        ) }
        <div className="actions">
          { !edit && <button className="button small" onClick={ showEditPack } title="Редактировать стикерпак">🖋️</button> }
          { edit && <button className="button success small" onClick={ savePack } title="Сохранить изменения">Сохранить</button> }
          { edit && <button className="button small" onClick={ hideEditPack } title="Отменить изменения">Отменить</button> }
          { edit && <button className="button clear small" onClick={ hideRemovePack } title="Удалить стикерпак">Удалить</button> }
        </div>
      </div>
      { edit ? (
        <div className="stickerListContent edited">
          <textarea rows={10} value={textItems} onChange={ handleItemsChange } />
        </div>
      ) : (
        <div className="stickerListContent">
          { visibleStickers.map((sticker, index) => (
            <div
              onDragStart={ handleDragStart }
              onDragEnter={ handleDragEnter }
              onDragLeave={ handleDragLeave }
              onDragEnd={ drop }
              draggable
              className="stickerItem"
              key={ sticker }
              data-index={ index }
            >
              <img src={ sticker }/>
            </div>
          )) }
        </div>
      ) }
    </div>
  )
}