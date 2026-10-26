import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { MaskIcon } from './MaskIcon';
import xIcon from '../assets/icons/x.svg';

import './icon.css';
import './modal.css';

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
};

/**
 * Generic dialog shell for "create new item" forms (sticker packs, templates).
 * Content (an <ItemEditor/>) supplies its own Save/Cancel buttons; onClose
 * here only covers the X button, Escape and backdrop click — the caller
 * decides what onClose does (usually: close, discard nothing was created).
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input, textarea')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [ onClose ]);

  return (
    <div
      class="modalOverlay"
      onMouseDown={ (event) => {
        if (event.target === event.currentTarget) onClose();
      } }
    >
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" ref={ panelRef }>
        <div class="modalHeader">
          <h2 id="modalTitle" class="modalTitle">{ title }</h2>
          <button
            type="button"
            class="button small icon-only clear"
            onClick={ onClose }
            title="Закрыть"
            aria-label="Закрыть"
          >
            <MaskIcon src={ xIcon } />
          </button>
        </div>
        <div class="modalBody">
          { children }
        </div>
      </div>
    </div>
  );
}
