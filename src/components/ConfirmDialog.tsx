import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

import './confirmDialog.css';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as a destructive (red) action. Defaults to true. */
  destructive?: boolean;
};

type ConfirmInput = ConfirmOptions | string;
type ConfirmApi = (options: ConfirmInput) => Promise<boolean>;

const noopConfirm: ConfirmApi = () => Promise.resolve(false);

const ConfirmContext = createContext<ConfirmApi>(noopConfirm);

/**
 * Promise-based replacement for the native window.confirm(), styled to match
 * the rest of the extension instead of the browser's own dialog chrome.
 * Usage: const confirmAction = useConfirm(); if (await confirmAction('...')) { ... }
 */
export function useConfirm() {
  return useContext(ConfirmContext);
}

type PendingState = {
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (value: boolean) => void;
};

export function ConfirmDialogProvider({ children }: { children: ComponentChildren }) {
  const [ pending, setPending ] = useState<PendingState | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;

  const close = useCallback((result: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    setPending(null);
    current.resolve(result);
  }, []);

  const confirmAction = useCallback<ConfirmApi>((options) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPending({
        title: normalized.title,
        message: normalized.message,
        confirmLabel: normalized.confirmLabel || 'Удалить',
        cancelLabel: normalized.cancelLabel || 'Отмена',
        destructive: normalized.destructive !== false,
        resolve,
      });
    });
  }, []);

  useEffect(() => {
    if (!pending) return;

    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [ pending, close ]);

  const value = useMemo(() => confirmAction, [ confirmAction ]);

  return (
    <ConfirmContext.Provider value={ value }>
      { children }
      { pending && (
        <div
          class="confirmDialogOverlay"
          onMouseDown={ (event) => {
            if (event.target === event.currentTarget) close(false);
          } }
        >
          <div
            class="confirmDialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmDialogTitle"
            aria-describedby="confirmDialogMessage"
          >
            <h2 id="confirmDialogTitle" class="confirmDialogTitle">
              { pending.title || 'Подтверждение' }
            </h2>
            <p id="confirmDialogMessage" class="confirmDialogMessage">{ pending.message }</p>
            <div class="confirmDialogActions">
              <button
                ref={ cancelRef }
                type="button"
                class="button small"
                onClick={ () => close(false) }
              >
                { pending.cancelLabel }
              </button>
              <button
                type="button"
                class={ `button small ${ pending.destructive ? 'error' : 'primary' }` }
                onClick={ () => close(true) }
              >
                { pending.confirmLabel }
              </button>
            </div>
          </div>
        </div>
      ) }
    </ConfirmContext.Provider>
  );
}
