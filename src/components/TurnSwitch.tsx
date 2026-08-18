import { MaskIcon } from './MaskIcon';
import featherIcon from '../assets/icons/feather.svg';
import hourglassIcon from '../assets/icons/hourglass.svg';

import './turnSwitch.css';

type Props = {
  myTurn: boolean;
  onChange: (myTurn: boolean) => void;
};

const WAIT_LABEL = 'Жду хода соигрока';
const MINE_LABEL = 'Сейчас ваш ход';

export function TurnSwitch({ myTurn, onChange }: Props) {
  return (
    <div
      className={ `turnSwitch ${ myTurn ? 'is-myTurn' : '' }` }
      role="radiogroup"
      aria-label="Чей ход"
    >
      <button
        type="button"
        className="turnSwitchOpt"
        role="radio"
        aria-checked={ myTurn ? 'false' : 'true' }
        aria-label={ WAIT_LABEL }
        title={ WAIT_LABEL }
        onClick={ () => onChange(false) }
      >
        <MaskIcon src={ hourglassIcon } />
      </button>
      <button
        type="button"
        className="turnSwitchOpt"
        role="radio"
        aria-checked={ myTurn ? 'true' : 'false' }
        aria-label={ MINE_LABEL }
        title={ MINE_LABEL }
        onClick={ () => onChange(true) }
      >
        <MaskIcon src={ featherIcon } />
      </button>
    </div>
  );
}
