import { StickerPack } from './stickerPack';
import { useEffect, useState } from "react";

type ListProps = {
  data: IStickerPack[];
  editStickerPack: (packId: number) => void;
  onStickerUsed?: (src: string) => void;
  localIds?: number[];
}


export function StickerList({
  data,
  editStickerPack,
  onStickerUsed,
  localIds = [],
}: ListProps) {
  const [ activeTab, setActiveTab ] = useState<number | null>(0);

  const handleActiveTabChange = (newTab: number) => {
    if (newTab === activeTab) {
      setActiveTab(null);
    } else {
      setActiveTab(newTab);
    }
  }

  useEffect(() => {
    const [ { id: packId = 0 } ] = data;

    setActiveTab(packId);
  }, []);

  return (
    <div>
      { data.map(pack => (
        <StickerPack
          key={ pack.id }
          opened={ pack.id === activeTab }
          pack={ pack }
          onChange={ handleActiveTabChange }
          editStickerPack={editStickerPack}
          onStickerUsed={ onStickerUsed }
          localOnly={ localIds.includes(pack.id) }
        />
      )) }
    </div>
  )
}
