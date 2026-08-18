import { createContext } from 'preact';
import { useCallback, useContext, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { MaskIcon } from '../components/MaskIcon';
import circleAlertIcon from '../assets/icons/circle-alert.svg';
import xIcon from '../assets/icons/x.svg';

type PopupToastApi = {
  text: string | null;
  showError: (text: string) => void;
  clearToast: () => void;
};

const PopupToastContext = createContext<PopupToastApi>({
  text: null,
  showError: () => {},
  clearToast: () => {},
});

export function usePopupToast() {
  return useContext(PopupToastContext);
}

export function PopupToastProvider({ children }: { children: ComponentChildren }) {
  const [ text, setText ] = useState<string | null>(null);

  const clearToast = useCallback(() => setText(null), []);
  const showError = useCallback((next: string) => {
    if (!next) return;
    setText(next);
  }, []);

  const value = useMemo(() => ({ text, showError, clearToast }), [ text, showError, clearToast ]);

  return (
    <PopupToastContext.Provider value={ value }>
      { children }
    </PopupToastContext.Provider>
  );
}

export function PopupToastBar() {
  const { text, clearToast } = usePopupToast();
  if (!text) return null;

  return (
    <div class="popupToast" role="status" aria-live="polite">
      <MaskIcon src={ circleAlertIcon } />
      <span class="popupToastText">{ text }</span>
      <button
        type="button"
        class="popupToastClose"
        onClick={ clearToast }
        title="Закрыть"
        aria-label="Закрыть"
      >
        <MaskIcon src={ xIcon } />
      </button>
    </div>
  );
}
