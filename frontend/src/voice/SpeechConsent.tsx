import { keyPart } from '../a11y/readParts';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface SpeechConsentProps {
  open: boolean;
  lang: string;
  /** "I agree" (remembered on this device). */
  onConsent: () => void;
  /** "Use another way" (remembered on this device: we don't ask again). */
  onDecline: () => void;
  /** Closed without an answer (Escape, ×): asked again next time. Defaults to onDecline. */
  onClose?: () => void;
}

export function SpeechConsent({ open, lang, onConsent, onDecline, onClose }: SpeechConsentProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose ?? onDecline}
      title={t(lang, 'voice.consent_title')}
      className="bo-speech-consent-dialog"
      lang={lang}
      readParts={() => [
        keyPart(lang, 'voice.consent_title'),
        keyPart(lang, 'voice.consent_body'),
        keyPart(lang, 'voice.agree'),
        keyPart(lang, 'voice.use_other_way'),
      ]}
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
