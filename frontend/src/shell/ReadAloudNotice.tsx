import { useEffect, useState } from 'react';
import { announce } from '../a11y/announce';
import { useModes, useSpeakerState } from '../a11y/modes';
import { hasUserGesture } from '../a11y/speaker';
import { Icon } from '../components/Icon';
import { t } from '../i18n/t';

let announcedOnce = false; // once per page, even with several widgets or a remount

const HIDE_ON = ['click', 'keyup', 'touchend', 'pointercancel'] as const;
const LISTEN = { capture: true, passive: true } as const;

/**
 * Read aloud is on by default, but browsers only let a page make sound after a key press or
 * a tap. Until then this notice sits at the top (in every offered language) and is announced
 * once in the live region, which screen readers read without any key press. It goes away after
 * that first key press or tap (once its click or key-up is over, so nothing moves under a
 * finger or the pointer in the middle of a click).
 */
export function ReadAloudNotice({ lang, languages }: { lang: string; languages: string[] }) {
  const { readAloud } = useModes();
  const { activated } = useSpeakerState();
  const [hidden, setHidden] = useState(() => hasUserGesture());
  const order = [lang, ...languages.filter((l) => l !== lang)];
  const orderKey = order.join(',');

  useEffect(() => {
    if (!readAloud || announcedOnce || hasUserGesture()) return;
    // Give the live region (mounted with the widget) a moment, then say it once.
    const timer = window.setTimeout(() => {
      if (announcedOnce || hasUserGesture()) return;
      announcedOnce = true;
      announce(orderKey.split(',').map((l) => ({ text: t(l, 'read_aloud.notice'), lang: l })));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [readAloud, orderKey]);

  useEffect(() => {
    if (!activated || hidden) return;
    let timer = 0;
    const hide = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHidden(true), 0);
    };
    HIDE_ON.forEach((type) => document.addEventListener(type, hide, LISTEN));
    const fallback = window.setTimeout(() => setHidden(true), 5000);
    return () => {
      HIDE_ON.forEach((type) => document.removeEventListener(type, hide, LISTEN));
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
    };
  }, [activated, hidden]);

  if (!readAloud || hidden) return null;

  return (
    <div className="bo-banner bo-banner-info bo-notice">
      <Icon name="volume_up" className="bo-banner-icon" />
      <p className="bo-banner-body" style={{ margin: 0 }}>
        {order.map((l) => (
          <span key={l} lang={l} style={{ display: 'block' }}>
            {t(l, 'read_aloud.notice')}
          </span>
        ))}
      </p>
    </div>
  );
}
