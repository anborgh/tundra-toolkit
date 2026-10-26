import { useBatchedItems } from '../../hooks/useBatchedItems';
import { MaskIcon } from '../../components/MaskIcon';
import editIcon from '../../assets/icons/pencil.svg';
import cloudIcon from '../../assets/icons/cloud.svg';
import cloudOffIcon from '../../assets/icons/cloud-off.svg';
import { insertSticker } from './insertSticker';
import { usePopupToast } from '../popupToast';

type PackProps = {
  pack: IStickerPack;
  onEdit: (packId: number) => void;
  onStickerUsed?: (src: string) => void;
  localOnly?: boolean;
};

export function StickerPack({
  pack,
  onEdit,
  onStickerUsed,
  localOnly = false,
}: PackProps) {
  const visibleStickers = useBatchedItems(pack.items, true);
  const { showError } = usePopupToast();

  const handleStickerClick = async (src: string) => {
    if (!src) return;

    onStickerUsed?.(src);
    await insertSticker(src, { onUnavailable: showError });
  };

  return (
    <section class="stickerPack" aria-label={ pack.name }>
      <div class="stickerPackHeader">
        <h3 class="stickerPackTitle">{ pack.name }</h3>
        <span
          class={ `stickerPackStorage ${ localOnly ? 'is-local' : '' }` }
          title={ localOnly ? 'Сохранено только в этом браузере' : 'Хранится в Chrome Sync' }
        >
          <MaskIcon src={ localOnly ? cloudOffIcon : cloudIcon } />
        </span>
        <button
          type="button"
          class="button small icon-only ghost"
          onClick={ () => onEdit(pack.id) }
          title="Редактировать стикерпак"
          aria-label="Редактировать стикерпак"
        >
          <MaskIcon src={ editIcon } />
        </button>
      </div>
      { pack.items.length > 0 ? (
        <div class="stickerPackGrid">
          { visibleStickers.map(sticker => (
            <button
              type="button"
              class="stickerItem"
              key={ sticker }
              onClick={ () => handleStickerClick(sticker) }
              aria-label="Вставить стикер"
            >
              <img src={ sticker } alt="" loading="lazy" />
            </button>
          )) }
        </div>
      ) : (
        <div class="emptyList">В этом паке пока нет стикеров. Добавьте ссылку ниже.</div>
      ) }
    </section>
  );
}
