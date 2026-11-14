import { useEffect, useState } from 'react';
import type { ApiConfig } from '../api/client';
import { fetchConfig, type WidgetConfig } from '../api/config';

/** GET /config once per partner (referral partners, help contacts, speech flags). */
export function useWidgetConfig(api: ApiConfig): WidgetConfig | null {
  const [config, setConfig] = useState<WidgetConfig | null>(null);

  useEffect(() => {
    let active = true;
    fetchConfig(api)
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch(() => {
        // Offline or a wrong partner key: the widget still works, without these extras.
      });
    return () => {
      active = false;
    };
  }, [api]);

  return config;
}
