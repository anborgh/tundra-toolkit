import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';
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
  const waitRef = useRef<HTMLButtonElement>(null);
  const mineRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(true);
      mineRef.current?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(false);
      waitRef.current?.focus();
    }
  };

  return (
    <div
      className={ `turnSwitch ${ myTurn ? 'is-myTurn' : '' }` }
      role="radiogroup"
      aria-label="Чей ход"
    >
      <button
        ref={ waitRef }
        type="button"
        className="turnSwitchOpt"
        role="radio"
        aria-checked={ myTurn ? 'false' : 'true' }
        aria-label={ WAIT_LABEL }
        title={ WAIT_LABEL }
        onClick={ () => onChange(false) }
        onKeyDown={ handleKeyDown }
      >
        <MaskIcon src={ hourglassIcon } />
      </button>
      <button
        ref={ mineRef }
        type="button"
        className="turnSwitchOpt"
        role="radio"
        aria-checked={ myTurn ? 'true' : 'false' }
        aria-label={ MINE_LABEL }
        title={ MINE_LABEL }
        onClick={ () => onChange(true) }
        onKeyDown={ handleKeyDown }
      >
        <MaskIcon src={ featherIcon } />
      </button>
    </div>
  );
}
