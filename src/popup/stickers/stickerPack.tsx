import {useEffect, useRef, useState} from "react";
import { useBatchedItems } from '../../hooks/useBatchedItems';
import { MaskIcon } from "../../components/MaskIcon";
import EditIcon from "../../assets/icons/pencil.svg";
import { insertSticker } from './insertSticker';

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
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const visibleStickers = useBatchedItems(pack.items, opened);

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

    const showNotice = (message: string) => {
      setNotice(message);
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
      noticeTimer.current = window.setTimeout(() => {
        setNotice(null);
        noticeTimer.current = null;
      }, 4000);
    };

    onStickerUsed?.(src);
    await insertSticker(src, { onUnavailable: showNotice });
  }

  useEffect(() => {
    return () => {
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    }
  }, []);

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
              title="Сохранено только на этом устройстве"
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
          {notice && (
            <div class="text-secondary" style={{ margin: '0 0 8px 0', fontSize: '12px' }}>
              {notice}
            </div>
          )}
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
