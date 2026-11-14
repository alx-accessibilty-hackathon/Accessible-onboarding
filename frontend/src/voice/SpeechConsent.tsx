import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface SpeechConsentProps {
  open: boolean;
  lang: string;
  onConsent: () => void;
  onDecline: () => void;
}

export function SpeechConsent({ open, lang, onConsent, onDecline }: SpeechConsentProps) {
  return (
    <Dialog
      open={open}
      onClose={onDecline}
      title={t(lang, 'voice.consent_title')}
      className="bo-speech-consent-dialog"
    >
      <div className="bo-speech-consent-content">
        <p>{t(lang, 'voice.consent_body')}</p>
        <div className="bo-actions" style={{ marginTop: 'var(--bo-space-4)' }}>
          <Button variant="primary" onClick={onConsent}>
            {t(lang, 'voice.agree')}
          </Button>
          <Button variant="secondary" onClick={onDecline}>
            {t(lang, 'voice.use_other_way')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
