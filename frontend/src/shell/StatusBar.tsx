import { useEffect, useRef, useState } from 'react';
import { announce } from '../a11y/announce';
import { Icon } from '../components/Icon';
import { t } from '../i18n/t';
import { pendingCount } from '../offline/outbox';
import { useOnline } from '../offline/useOnline';

export interface StatusBarProps {
  lang: string;
  /** The registration whose answers are saved. Without one, only answers kept on this phone
   * before the registration exists (outbox "local") are shown. */
  registrationId?: string;
  className?: string;
  /** Change it to re-check the outbox now (e.g. right after an answer was queued or synced). */
  refreshKey?: number;
}

export const LOCAL_OUTBOX = 'local';

export function StatusBar({ lang, registrationId, className, refreshKey }: StatusBarProps) {
  const online = useOnline();
  const [pending, setPending] = useState(0);
  const prevStatusRef = useRef<string>('');

  useEffect(() => {
    let active = true;

    async function checkPending() {
      try {
        const count =
          (registrationId ? await pendingCount(registrationId) : 0) +
          (await pendingCount(LOCAL_OUTBOX));
        if (active) setPending(count);
      } catch {
        // ignore storage errors
      }
    }

    checkPending();
    const interval = setInterval(checkPending, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [registrationId, refreshKey]);

  let statusText: string;
  let iconName: string;
  let statusColor: string;

  if (!online) {
    statusText = t(lang, 'status.offline');
    iconName = 'info';
    statusColor = 'var(--bo-text-muted)';
  } else if (pending > 0) {
    statusText = t(lang, 'status.saved_local');
    iconName = 'info';
    statusColor = 'var(--bo-navy)';
  } else if (registrationId) {
    statusText = t(lang, 'status.saved_account');
    iconName = 'check_circle';
    statusColor = 'var(--bo-success)';
  } else {
    statusText = ''; // nothing saved yet
    iconName = 'info';
    statusColor = 'var(--bo-text-muted)';
  }

  // Announce status change to screen readers via the single live region (W1)
  useEffect(() => {
    if (prevStatusRef.current && statusText && prevStatusRef.current !== statusText) {
      announce(statusText);
    }
    prevStatusRef.current = statusText;
  }, [statusText]);

  const cls = className ? `bo-status-bar ${className}` : 'bo-status-bar';
  if (!statusText) return null;

  return (
    <div
      className={cls}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--bo-space-2)',
        fontSize: '0.85em',
        color: statusColor,
        padding: 'var(--bo-space-2) 0',
      }}
    >
      <Icon name={iconName} size="1.2em" />
      <span>{statusText}</span>
    </div>
  );
}
