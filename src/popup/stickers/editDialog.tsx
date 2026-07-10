import { useEffect, useRef, useState } from 'react';
import { checkImageURL } from '../../utils';

type Props = {
  pack?: IStickerPack;
  onSave: (data: IStickerPack) => void;
  onRemove: (packId: number) => void;
  close: () => void;
}

export function EditDialog<Props>({
  pack,
  onSave,
  onRemove,
  close,
}) {
  const ref = useRef();

  const initialState: IStickerPack = {
    id: 0,
    name: '',
    items: [],
  }

  const [newData, setNewData] = useState<IStickerPack>(initialState);

  const handleNameChange = event => {
    setNewData({ ...newData, name: event.target.value });
  }

  const handleItemsChange = event => {
    const values = event.target.value.split('\n');
    setNewData({ ...newData, items: values });
  }

  const handleSave = () => {
    const clearedData = {
      ...newData,
      items: newData.items.filter(item => checkImageURL(item)),
    }
    onSave(clearedData);
  }

  const handleRemove = () => {
    if (!pack) return;

    const isConfirmed = confirm('Удалить стикерпак? Это необратимо.')

    if (!isConfirmed) return;

    onRemove(pack.id);
    close();
  }

  useEffect(() => {
    if (!!pack) {
      // @ts-ignore
      ref.current?.showModal();
    } else {
      // @ts-ignore
      ref.current?.close();
    }
  }, [pack]);

  useEffect(() => {
    if (!pack) return;

    setNewData(pack);
  }, [pack]);

  return (
    <dialog class="editPackDialog" ref={ref} onCancel={close}>
      <div className="editPackDialogWrapper">
        <div className="editPackDialogNameWrapper">
          <input type="text" value={ newData.name } onChange={ handleNameChange }/>
        </div>
        <div className="editPackDialogItemsWrapper">
          <textarea rows={ 4 } value={ newData.items.join('\n') } onChange={ handleItemsChange }/>
        </div>
        <div className="editPackDialogActions">
          <button
            onClick={ handleSave }
            className="button small success"
          >
            Сохранить
          </button>
          <button
            onClick={ close }
            className="button small"
          >
            Отмена
          </button>
          <button
            onClick={ handleRemove }
            className="button clear small"
          >
            Удалить
          </button>
        </div>
      </div>
    </dialog>
  )
}
