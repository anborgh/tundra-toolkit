import { useEffect, useRef, useState } from 'react';

const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 100;

export function useBatchedItems<T>(items: T[], active: boolean) {
  const [visibleCount, setVisibleCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);

  useEffect(() => {
    sessionRef.current += 1;
    const sessionId = sessionRef.current;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!active || !items.length) {
      setVisibleCount(0);
      return;
    }

    setVisibleCount(0);

    let pointer = 0;

    const renderChunk = () => {
      if (sessionId !== sessionRef.current) {
        return;
      }

      pointer = Math.min(pointer + BATCH_SIZE, items.length);
      setVisibleCount(pointer);

      if (pointer < items.length) {
        timerRef.current = window.setTimeout(renderChunk, BATCH_INTERVAL_MS);
      } else {
        timerRef.current = null;
      }
    };

    timerRef.current = window.setTimeout(renderChunk, BATCH_INTERVAL_MS);

    return () => {
      sessionRef.current += 1;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [ items, active ]);

  return items.slice(0, visibleCount);
}
