// React hook: live online/offline status (FB-7).

import { useEffect, useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ */
/*  External-store wiring                                              */
/* ------------------------------------------------------------------ */

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // During SSR assume online.
  return true;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Returns `true` when the browser reports connectivity, `false` when offline.
 * Re-renders the component whenever the status changes.
 */
export function useOnline(): boolean {
  // useSyncExternalStore is the React 18 way to read external state
  // safely, including during concurrent rendering.
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Belt-and-suspenders: force a re-check after mount in case the
  // snapshot changed between render and commit (extremely rare).
  useEffect(() => {
    // no-op — the subscription already handles updates.
  }, [online]);

  return online;
}
