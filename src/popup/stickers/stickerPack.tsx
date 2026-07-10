import {useEffect, useRef, useState} from "react";

type PackProps = {
  pack: IStickerPack;
  opened: boolean;
  onChange: (newActiveTab: number) => void;
  editStickerPack: (packId: number) => void;
}

export function StickerPack({
  pack,
  onChange,
  opened,
  editStickerPack,
}: PackProps) {

  const [titleImg, setTitleImg] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

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

    const copyWithNotice = async () => {
      try {
        await navigator.clipboard?.writeText(src);
      } catch (e) {
        // ignore clipboard errors; notify anyway
      } finally {
        showNotice('Вставка недоступна. Ссылка на картинку скопирована в буфер обмена.');
      }
    };

    chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
      const activeTabId = tabs?.[0]?.id;
      if (!activeTabId) {
        copyWithNotice();
        return;
      }

      chrome.tabs.sendMessage(activeTabId, {
        type: 'tundra_toolkit_insert_sticker',
        src,
      }, async (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          await copyWithNotice();
        }
      });
    });
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
          {pack.updatedAt && (
            <div class="stickerPackMeta">
              Обновлено: { new Date(pack.updatedAt).toLocaleDateString('ru-RU') }
            </div>
          )}
        </div>
        <div className="stickerPackTitleActions">
          <button className="button small clear" onClick={handleEditPack}>Править</button>
        </div>
      </div>
      {opened && (
        <div class="stickerPackContent">
          {notice && (
            <div class="text-secondary" style={{ margin: '0 0 8px 0', fontSize: '12px' }}>
              {notice}
            </div>
          )}
          {pack.items.map(sticker => (
            <div class="stickerItem">
              <img src={sticker} key={sticker} onClick={handleStickerClick} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}