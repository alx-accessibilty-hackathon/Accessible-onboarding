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
}

export function ReviewCard({
  rawTranscript,
  normalizedValue,
  lang,
  onKeep,
  onSayAgain,
  onTypeInstead,
}: ReviewCardProps) {
  const displayValue = Array.isArray(normalizedValue)
    ? normalizedValue.join(', ')
    : String(normalizedValue);

  return (
    <Card className="bo-voice-review-card" style={{ marginTop: 'var(--bo-space-3)' }}>
      <div style={{ marginBottom: 'var(--bo-space-3)' }}>
        <p className="bo-hint" style={{ margin: 0, fontWeight: 600 }}>
          {t(lang, 'voice.heard')}
        </p>
        <p style={{ margin: 'var(--bo-space-1) 0', fontStyle: 'italic', color: 'var(--bo-text)' }}>
          "{rawTranscript}"
        </p>
      </div>

      <div style={{ marginBottom: 'var(--bo-space-4)' }}>
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

      <div className="bo-actions">
        <Button variant="primary" onClick={onKeep}>
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
