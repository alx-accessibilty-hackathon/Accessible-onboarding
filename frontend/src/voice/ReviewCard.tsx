import type { RefObject } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { t } from '../i18n/t';

export interface ReviewCardProps {
  rawTranscript: string;
  normalizedValue: string | string[];
  lang: string;
  onKeep: () => void;
  onSayAgain: () => void;
  onTypeInstead: () => void;
  /** Focus goes to Keep when the card appears (the button that was pressed is gone). */
  keepRef?: RefObject<HTMLButtonElement>;
  /** Other guesses, when the speech service wasn't sure. */
  alternatives?: string[];
  onAlternative?: (index: number) => void;
}

export function ReviewCard({
  rawTranscript,
  normalizedValue,
  lang,
  onKeep,
  onSayAgain,
  onTypeInstead,
  keepRef,
  alternatives = [],
  onAlternative,
}: ReviewCardProps) {
  const displayValue = Array.isArray(normalizedValue)
    ? normalizedValue.join(', ')
    : String(normalizedValue);

  return (
    <Card className="bo-voice-review-card" style={{ marginTop: 'var(--bo-space-3)' }}>
      {/* What the learner said: personal, never sent to a speech service (data-bo-private). */}
      <div data-bo-private="" style={{ marginBottom: 'var(--bo-space-3)' }}>
        <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
          {t(lang, 'voice.heard')}
        </p>
        <p style={{ margin: 'var(--bo-space-1) 0', fontStyle: 'italic', color: 'var(--bo-text)' }}>
          "{rawTranscript}"
        </p>
      </div>

      <div data-bo-private="" style={{ marginBottom: 'var(--bo-space-4)' }}>
        <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
          {t(lang, 'voice.filled')}
        </p>
        <p
          style={{
            margin: 'var(--bo-space-1) 0',
            fontSize: '1.1em',
            fontWeight: 700,
            color: 'var(--bo-text)',
          }}
        >
          {displayValue}
        </p>
      </div>

      {alternatives.length > 0 && onAlternative && (
        <div data-bo-private="" style={{ marginBottom: 'var(--bo-space-4)' }}>
          <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-2)', fontWeight: 600 }}>
            {t(lang, 'voice.did_you_mean')}
          </p>
          <div className="bo-actions">
            {alternatives.map((alt, i) => (
              <Button key={alt} variant="secondary" onClick={() => onAlternative(i)}>
                {alt}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="bo-actions">
        <Button ref={keepRef} variant="primary" onClick={onKeep}>
          {t(lang, 'voice.keep')}
        </Button>
        <Button variant="secondary" onClick={onSayAgain}>
          {t(lang, 'voice.say_again')}
        </Button>
        <Button variant="secondary" onClick={onTypeInstead}>
          {t(lang, 'voice.type_instead')}
        </Button>
      </div>
    </Card>
  );
}
