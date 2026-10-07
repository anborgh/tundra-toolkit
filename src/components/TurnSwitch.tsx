import { MaskIcon } from './MaskIcon';
import featherIcon from '../assets/icons/feather.svg';
import hourglassIcon from '../assets/icons/hourglass.svg';

import './turnSwitch.css';

type Props = {
  myTurn: boolean;
  onChange: (myTurn: boolean) => void;
};

const MINE_LABEL = 'Мой ход — нажмите, чтобы снять отметку';
const WAIT_LABEL = 'Жду ответа — нажмите, чтобы отметить свой ход';

export function TurnSwitch({ myTurn, onChange }: Props) {
  const label = myTurn ? MINE_LABEL : WAIT_LABEL;
  return (
    <button
      type="button"
      class={ `turnToggle ${ myTurn ? 'is-myTurn' : '' }` }
      aria-pressed={ myTurn }
      aria-label={ label }
      title={ myTurn ? 'Мой ход' : 'Жду ответа' }
      onClick={ () => onChange(!myTurn) }
    >
      <MaskIcon src={ myTurn ? featherIcon : hourglassIcon } />
    </button>
  );
}
