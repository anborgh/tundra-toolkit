import { MaskIcon } from '../components/MaskIcon';
import powerIcon from '../assets/icons/power.svg';

export type EnableBannerProps = {
  host: string;
  busy: boolean;
  onEnable: () => void;
};

type Props = EnableBannerProps & {
  title: string;
};

/**
 * Shown only on tabs that hand data over to the forum page (stickers, drafts):
 * inserting into the reply form needs Tundra Toolkit enabled on this forum.
 */
export function EnableBanner({ host, busy, onEnable, title }: Props) {
  return (
    <section class="enableBanner" aria-label="Tundra Toolkit выключен на этом форуме">
      <div class="enableBannerBody">
        <div class="enableBannerIcon" aria-hidden="true">
          <MaskIcon src={ powerIcon } />
        </div>
        <div>
          <div class="enableBannerTitle">{ title }</div>
          <div class="enableBannerText">
            Для этого включите Tundra Toolkit на форуме. Включайте только на форумах, которым доверяете.
          </div>
        </div>
      </div>
      <button type="button" class="button" disabled={ busy } onClick={ onEnable }>
        <MaskIcon src={ powerIcon } />
        Включить на { host }
      </button>
    </section>
  );
}
