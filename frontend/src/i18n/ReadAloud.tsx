import { useEffect, useId, useRef } from 'react';
import { useModes, useSpeakerState } from '../a11y/modes';
import { primeSpeech, speak, stopSpeaking, type Part } from '../a11y/speaker';
import { Icon } from '../components/Icon';
import { t } from './t';

export interface ListenButtonProps {
  lang: string;
  /** What to read, built when pressed so it is always what is on screen now. */
  parts: () => Part[];
  className?: string;
  /** The button's text when it isn't reading (default: "Listen" / "Read again"). */
  label?: string;
  /** Stop reading as soon as the person moves focus somewhere else (e.g. a long list). */
  stopOnFocusMove?: boolean;
}

/**
 * "Listen" (or "Read again" while Read aloud mode is on): reads this screen on request, for
 * people who don't use the mode. Pressing it again while it reads stops it. Every source and
 * privacy rule of the speaker applies (a11y/speaker.ts).
 */
export function ListenButton({
  lang,
  parts,
  className,
  label: idleLabel,
  stopOnFocusMove = false,
}: ListenButtonProps) {
  const owner = `listen:${useId()}`;
  const { readAloud } = useModes();
  const speaker = useSpeakerState();
  const playing = speaker.speaking && speaker.owner === owner;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => stopSpeaking(owner), [owner]);

  // Moving on (Tab, a tap elsewhere) stops a long reading.
  useEffect(() => {
    const button = buttonRef.current;
    if (!stopOnFocusMove || !playing || !button) return;
    const root = button.getRootNode() as Document | ShadowRoot;
    const onFocus = (e: Event) => {
      if (e.target !== button) stopSpeaking(owner);
    };
    root.addEventListener('focusin', onFocus);
    return () => root.removeEventListener('focusin', onFocus);
  }, [stopOnFocusMove, playing, owner]);

  const label = playing
    ? t(lang, 'read_aloud.stop')
    : (idleLabel ?? (readAloud ? t(lang, 'read_aloud.again') : t(lang, 'common.listen')));

  const handleClick = () => {
    if (playing) {
      stopSpeaking(owner);
      return;
    }
    primeSpeech();
    void speak(parts(), lang, { owner });
  };

  const cls = className
    ? `bo-read-aloud bo-btn bo-btn-secondary ${className}`
    : 'bo-read-aloud bo-btn bo-btn-secondary';

  return (
    <button
      ref={buttonRef}
      type="button"
      className={cls}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bo-space-2)',
        minHeight: 'var(--bo-target)',
        padding: '0.4em 0.8em',
      }}
    >
      <Icon name={playing ? 'stop' : 'volume_up'} />
      <span>{label}</span>
    </button>
  );
}
