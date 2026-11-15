import { useId } from 'react';
import { useModes, useSpeakerState } from '../a11y/modes';
import { setTextSize, TEXT_SIZES, useTextSize } from '../a11y/settings';
import { primeSpeech, stopSpeaking } from '../a11y/speaker';
import { Icon } from '../components/Icon';
import { languageName } from '../i18n/registry';
import { t } from '../i18n/t';

export interface ModeTogglesProps {
  lang: string;
  /** Before a language is chosen, each label is shown in every offered language. */
  bilingual?: string[] | null;
  /** Offer "Answer by speaking" (the widget; not the staff pages). Default true. */
  answerBySpeaking?: boolean;
}

/** A label in the current language, or in every offered language (each with its `lang`). */
export function Label({
  lang,
  k,
  bilingual,
}: {
  lang: string;
  k: string;
  bilingual?: string[] | null;
}) {
  if (!bilingual || bilingual.length < 2) return <span>{t(lang, k)}</span>;
  const order = [lang, ...bilingual.filter((l) => l !== lang)];
  return (
    <span>
      {order.map((l, i) => (
        <span key={l} lang={l}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {t(l, k)}
        </span>
      ))}
    </span>
  );
}

/**
 * Text size: 100% to 400%, saved on this device. Everything in the widget is sized from the
 * root font size and the --bo-scale variable (styles.css), so it all grows and reflows.
 */
export function TextSizeControl({
  lang,
  bilingual,
}: {
  lang: string;
  bilingual?: string[] | null;
}) {
  const size = useTextSize();
  const name = `bo-text-size-${useId()}`;
  return (
    <fieldset className="bo-text-size">
      <legend className="bo-text-size-legend">
        <Label lang={lang} k="text_size.label" bilingual={bilingual} />
      </legend>
      <div className="bo-chips">
        {TEXT_SIZES.map((percent) => (
          <label key={percent} className={percent === size ? 'bo-chip bo-chip-on' : 'bo-chip'}>
            <input
              type="radio"
              name={name}
              value={percent}
              checked={percent === size}
              onChange={() => setTextSize(percent)}
            />
            <span>{`${percent}%`}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The persistent modes, on every screen (header) and on the first screen:
 * Read aloud (screens, errors, panels and the focused element are read by themselves; on until
 * the person turns it off), Answer by speaking (the microphone listens by itself on questions
 * you can say) and the text size. All are saved on this device.
 */
export function ModeToggles({
  lang,
  bilingual,
  answerBySpeaking: offerSpeaking = true,
}: ModeTogglesProps) {
  const { readAloud, answerBySpeaking, setReadAloud, setAnswerBySpeaking } = useModes();
  const { unavailable } = useSpeakerState();

  const toggleReadAloud = () => {
    if (readAloud) {
      stopSpeaking();
      setReadAloud(false);
    } else {
      primeSpeech(); // this tap allows the browser to play what is read next
      setReadAloud(true);
    }
  };

  const button = (on: boolean, icon: string, k: string, onClick: () => void) => (
    <button
      type="button"
      className="bo-btn bo-btn-secondary"
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bo-space-2)',
        padding: '0.4em 0.8em',
        background: on ? 'var(--bo-selected-bg)' : undefined,
        borderColor: on ? 'var(--bo-primary)' : undefined,
      }}
    >
      <Icon name={icon} />
      <Label lang={lang} k={k} bilingual={bilingual} />
      {/* Not by colour alone: a tick when it is on */}
      {on && <Icon name="check" style={{ color: 'var(--bo-primary)' }} />}
    </button>
  );

  const notAvailable = readAloud && unavailable.includes(lang);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
      <div className="bo-actions" style={{ gap: 'var(--bo-space-2)' }}>
        {button(readAloud, 'volume_up', 'header.read_aloud', toggleReadAloud)}
        {offerSpeaking &&
          button(answerBySpeaking, 'mic', 'header.answer_by_speaking', () =>
            setAnswerBySpeaking(!answerBySpeaking),
          )}
      </div>
      <TextSizeControl lang={lang} bilingual={bilingual} />
      {notAvailable && (
        <p className="bo-hint" style={{ margin: 0 }}>
          {t(lang, 'read_aloud.unavailable', { language: languageName(lang) })}
        </p>
      )}
    </div>
  );
}
