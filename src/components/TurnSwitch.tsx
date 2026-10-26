import { MaskIcon } from './MaskIcon';
import featherIcon from '../assets/icons/feather.svg';
import hourglassIcon from '../assets/icons/hourglass.svg';

import './turnSwitch.css';

type Props = {
  myTurn: boolean;
  onChange: (myTurn: boolean) => void;
};

export function TurnSwitch({ myTurn, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      class={ `turnSwitch ${ myTurn ? 'is-myTurn' : 'is-waiting' }` }
      aria-checked={ myTurn }
      aria-label="Ожидается мой пост"
      title={ myTurn ? 'Мой ход — нажмите, чтобы снять отметку' : 'Жду ответа — нажмите, чтобы отметить свой ход' }
      onClick={ () => onChange(!myTurn) }
    >
      <span class="turnSwitchSeg turnSwitchWait"><MaskIcon src={ hourglassIcon } /></span>
      <span class="turnSwitchSeg turnSwitchMine"><MaskIcon src={ featherIcon } /></span>
    </button>
  );
}
