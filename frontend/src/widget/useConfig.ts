import { useCallback, useEffect, useState } from 'react';
import type { ApiConfig } from '../api/client';
import { fetchConfig, type WidgetConfig } from '../api/config';

export interface WidgetConfigState {
  config: WidgetConfig | null;
  /** Ask the server again now (e.g. "Try again" on a list that didn't load). */
  reload: () => void;
}

const RETRY_MS = [3_000, 10_000, 30_000];

/**
 * GET /config once per partner (languages, referral partners, help contacts, speech flags).
 * If it fails (offline, the API restarting) the widget still works, and we try again: a few
 * times, whenever the connection comes back, and on request. Before, one failed request left
 * e.g. "Which organisation can help you?" without any option for the rest of the visit.
 */
export function useWidgetConfig(api: ApiConfig): WidgetConfigState {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = (tries: number) => {
      fetchConfig(api)
        .then((c) => {
          if (active) setConfig(c);
        })
        .catch(() => {
          if (active && tries < RETRY_MS.length) {
            timer = window.setTimeout(() => load(tries + 1), RETRY_MS[tries]);
          }
        });
    };
    load(0);
    const onOnline = () => load(RETRY_MS.length); // once more, no further retries
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [api, attempt]);

  return { config, reload };
}
