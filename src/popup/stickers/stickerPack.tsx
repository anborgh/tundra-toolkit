import {useEffect, useState} from "react";
import { useBatchedItems } from '../../hooks/useBatchedItems';
import { MaskIcon } from "../../components/MaskIcon";
import EditIcon from "../../assets/icons/pencil.svg";
import { insertSticker } from './insertSticker';
import { usePopupToast } from '../popupToast';

type PackProps = {
  pack: IStickerPack;
  opened: boolean;
  onChange: (newActiveTab: number) => void;
  editStickerPack: (packId: number) => void;
  onStickerUsed?: (src: string) => void;
  localOnly?: boolean;
}

export function StickerPack({
  pack,
  onChange,
  opened,
  editStickerPack,
  onStickerUsed,
  localOnly = false,
}: PackProps) {

  const [titleImg, setTitleImg] = useState<string>('');
  const visibleStickers = useBatchedItems(pack.items, opened);
  const { showError } = usePopupToast();

  const handleTitleClick = () => {
    onChange(pack.id)
  }

  const handleEditPack = event => {
    event.stopPropagation();
    editStickerPack(pack.id);
  }

  const handleStickerClick = async (event) => {
    const src = event?.target?.src;
    if (!src) return;

    onStickerUsed?.(src);
    await insertSticker(src, { onUnavailable: showError });
  }

  useEffect(() => {
    if (!pack.items.length) return;

    setTitleImg(pack.items[0]);
  }, [pack])

  return (
    <div class="stickerPack">
      <div class="stickerPackHeader">
        {titleImg && (
          <div
            className="stickerPackTitleIcon"
            style={`--bg-image: url(${titleImg});`}
            onClick={handleTitleClick}
          ></div>
        )}
        <div class="stickerPackTitle" onClick={handleTitleClick}>
          <div class="stickerPackTitleText">{pack.name}</div>
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
          <button className="button small" onClick={handleEditPack}><MaskIcon src={EditIcon} /></button>
        </div>
      </div>
      {opened && (
        <div class="stickerPackContent">
          {visibleStickers.map(sticker => (
            <div class="stickerItem" key={sticker}>
              <img src={sticker} onClick={handleStickerClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
