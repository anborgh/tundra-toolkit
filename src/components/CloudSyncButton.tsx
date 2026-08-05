import { MaskIcon } from './MaskIcon';
import cloudIcon from '../assets/icons/cloud.svg';
import cloudOffIcon from '../assets/icons/cloud-off.svg';
import type { ItemLocation } from '../utils/storage';

import './icon.css';

type Props = {
  location: ItemLocation;
  onToggle: () => void;
  disabled?: boolean;
};

const LABELS: Record<ItemLocation, string> = {
  sync: 'В облаке. Нажмите, чтобы хранить только в этом браузере',
  local: 'Снято с облака из‑за нехватки места. Нажмите, чтобы закрепить только здесь',
  localPinned: 'Только в этом браузере. Нажмите, чтобы вернуть в облако',
};

export function CloudSyncButton({ location, onToggle, disabled = false }: Props) {
  const pinned = location === 'localPinned';
  const autoLocal = location === 'local';

  return (
    <button
      type="button"
      className={ `cloudSyncBtn cloudSyncBtn--${ location }` }
      title={ LABELS[location] }
      aria-label={ LABELS[location] }
      aria-pressed={ location === 'sync' }
      disabled={ disabled }
      onClick={ (event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      } }
    >
      <MaskIcon
        src={ pinned ? cloudOffIcon : cloudIcon }
        class={ autoLocal ? 'cloudSyncIconMuted' : '' }
      />
    </button>
  );
}

export const hasCloudOverflow = (locations: Record<string, ItemLocation>) =>
  Object.values(locations).some(loc => loc === 'local' || loc === 'localPinned');
