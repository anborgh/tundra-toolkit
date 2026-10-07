import { MaskIcon } from '../../components/MaskIcon';
import plusIcon from '../../assets/icons/plus.svg';

type ListProps = {
  data: IStickerPack[];
  activeId: number | null;
  onSelect: (packId: number) => void;
  onCreate: () => void;
  createDisabled?: boolean;
};

/** Pack selector: chips with the first sticker of each pack as a tiny cover. */
export function StickerList({
  data,
  activeId,
  onSelect,
  onCreate,
  createDisabled = false,
}: ListProps) {
  return (
    <div class="stickerChips" role="group" aria-label="Стикерпаки">
      { data.map(pack => {
        const cover = pack.items[0];
        const active = pack.id === activeId;
        return (
          <button
            key={ pack.id }
            type="button"
            class="stickerChip"
            aria-pressed={ active }
            onClick={ () => onSelect(pack.id) }
            title={ pack.name }
          >
            <span class="stickerChipCover" aria-hidden="true">
              { cover && <img src={ cover } alt="" loading="lazy" /> }
            </span>
            <span class="stickerChipName">{ pack.name }</span>
            <span class="stickerChipCount">{ pack.items.length }</span>
          </button>
        );
      }) }
      <button
        type="button"
        class="stickerChip stickerChipAdd"
        onClick={ onCreate }
        disabled={ createDisabled }
        title="Новый стикерпак"
        aria-label="Новый стикерпак"
      >
        <MaskIcon src={ plusIcon } />
      </button>
    </div>
  );
}
