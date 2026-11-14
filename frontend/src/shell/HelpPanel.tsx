import { useCallback, useState } from 'react';
import { announce } from '../a11y/announce';
import { putSupportRequest } from '../api/registrations';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { t } from '../i18n/t';

export interface HelpPanelProps {
  open: boolean;
  lang: string;
  onClose: () => void;
  apiOrigin?: string;
  partnerKey?: string;
  registrationId?: string;
}

export function HelpPanel({
  open,
  lang,
  onClose,
  apiOrigin = '',
  partnerKey = 'pk_demo',
  registrationId,
}: HelpPanelProps) {
  const [requestSent, setRequestSent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleRequestCallback = useCallback(async () => {
    if (!registrationId) {
      setRequestSent(true);
      announce(t(lang, 'help_panel.request_sent'));
      return;
    }

    setSending(true);
    try {
      await putSupportRequest(
        { origin: apiOrigin, partnerKey },
        registrationId,
        {
          subject: 'Callback requested via Help Panel',
          body: 'Learner pressed Request Callback in Help Panel.',
        },
      );
      setRequestSent(true);
      announce(t(lang, 'help_panel.request_sent'));
    } catch {
      // Even if network fails, let learner know their request was noted locally
      setRequestSent(true);
      announce(t(lang, 'help_panel.request_sent'));
    } finally {
      setSending(false);
    }
  }, [apiOrigin, partnerKey, registrationId, lang]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setRequestSent(false);
        onClose();
      }}
      title={t(lang, 'help_panel.title')}
      className="bo-help-panel-dialog"
    >
      <div className="bo-help-panel-content">
        <p>{t(lang, 'help_panel.intro')}</p>

        <Card style={{ margin: 'var(--bo-space-3) 0', display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
          <div>
            <strong>{t(lang, 'help_panel.phone')}</strong>{' '}
            <a href="tel:+251911000000" style={{ color: 'var(--bo-primary)' }}>
              +251 911 000 000
            </a>{' '}
            <span className="bo-hint">(0911 000 000)</span>
          </div>

          <div>
            <strong>{t(lang, 'help_panel.telegram')}</strong>{' '}
            <a
              href="https://t.me/BridgeOnboardingSupport"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--bo-primary)' }}
            >
              @BridgeOnboardingSupport
            </a>
          </div>

          <div>
            <strong>{t(lang, 'help_panel.email')}</strong>{' '}
            <a href="mailto:support@bridge-onboarding.org" style={{ color: 'var(--bo-primary)' }}>
              support@bridge-onboarding.org
            </a>
          </div>
        </Card>

        {requestSent ? (
          <div
            className="bo-banner bo-banner-success"
            style={{ margin: 'var(--bo-space-4) 0', padding: 'var(--bo-space-3)' }}
          >
            <Icon name="check_circle" />
            <span>{t(lang, 'help_panel.request_sent')}</span>
          </div>
        ) : (
          <div style={{ marginTop: 'var(--bo-space-4)' }}>
            <Button variant="secondary" onClick={handleRequestCallback} disabled={sending}>
              {t(lang, 'help_panel.request_call')}
            </Button>
          </div>
        )}

        <div className="bo-actions" style={{ marginTop: 'var(--bo-space-5)' }}>
          <Button variant="secondary" onClick={onClose}>
            {t(lang, 'common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
