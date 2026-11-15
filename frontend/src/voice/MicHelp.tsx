import { keyPart } from '../a11y/readParts';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface MicHelpProps {
  open: boolean;
  lang: string;
  onClose: () => void;
}

export function MicHelp({ open, lang, onClose }: MicHelpProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t(lang, 'voice.mic_help_title')}
      className="bo-mic-help-dialog"
      lang={lang}
      readParts={() => [
        keyPart(lang, 'voice.mic_help_title'),
        keyPart(lang, 'voice.mic_help_body'),
      ]}
    >
      <div className="bo-mic-help-content">
        <p>{t(lang, 'voice.mic_help_body')}</p>
        <div className="bo-actions" style={{ marginTop: 'var(--bo-space-4)' }}>
          <Button variant="primary" onClick={onClose}>
            {t(lang, 'common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
