import { useEffect, useState } from 'react';
import { StickerPack } from './stickerPack';

type ListProps = {
  data: IStickerPack[];
  editingId: number | null;
  onEdit: (packId: number) => void;
  onCancelEdit: () => void;
  onSave: (pack: IStickerPack) => void | Promise<void>;
  onRemove: (packId: number) => void | Promise<void>;
  onStickerUsed?: (src: string) => void;
  localIds?: number[];
};

export function StickerList({
  data,
  editingId,
  onEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onStickerUsed,
  localIds = [],
}: ListProps) {
  const [ activeTab, setActiveTab ] = useState<number | null>(null);

  const handleActiveTabChange = (newTab: number) => {
    if (newTab === activeTab) {
      setActiveTab(null);
    } else {
      setActiveTab(newTab);
    }
  };

  useEffect(() => {
    const firstId = data[0]?.id;
    if (typeof firstId === 'number') setActiveTab(firstId);
  }, []);

  useEffect(() => {
    if (editingId != null) setActiveTab(editingId);
  }, [ editingId ]);

  return (
    <div>
      { data.map(pack => (
        <StickerPack
          key={ pack.id }
          opened={ pack.id === activeTab }
          editing={ pack.id === editingId }
          pack={ pack }
          onChange={ handleActiveTabChange }
          onEdit={ onEdit }
          onCancelEdit={ onCancelEdit }
          onSave={ onSave }
          onRemove={ onRemove }
          onStickerUsed={ onStickerUsed }
          localOnly={ localIds.includes(pack.id) }
        />
      )) }
    </div>
  );
}
