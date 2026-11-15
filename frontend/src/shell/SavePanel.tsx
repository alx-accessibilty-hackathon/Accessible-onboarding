import { useCallback, useState } from 'react';
import { announce } from '../a11y/announce';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { forgetEverything, logout } from '../api/auth';
import type { ApiConfig } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface SavePanelProps {
  open: boolean;
  lang: string;
  onClose: () => void;
  /** The learner's API settings (with their token), when a registration exists. */
  api?: ApiConfig | null;
  registrationId?: string;
  /** Called after "Forget me on this phone" deleted everything (start again, no page reload). */
  onForget?: () => void;
  /** "See or change my details": the profile page (shown once a registration exists). */
  onOpenProfile?: () => void;
}

// "Continue on another device" (a link and a code) is not offered: the link would open a page
// that can't resume a sign-up yet (/r/<token> has no resume screen), so the promise wasn't true.
export function SavePanel({
  open,
  lang,
  onClose,
  api,
  registrationId,
  onForget,
  onOpenProfile,
}: SavePanelProps) {
  const [confirmingForget, setConfirmingForget] = useState(false);

  const handleForget = useCallback(async () => {
    if (api?.token) {
      try {
        await logout(api); // end the session on the server too
      } catch {
        // Offline or already expired: the token is deleted from this phone anyway.
      }
    }
    try {
      await forgetEverything();
    } catch {
      // storage blocked: nothing was kept
    }
    announce(t(lang, 'save_panel.forgot_done'));
    setConfirmingForget(false);
    onClose();
    onForget?.();
  }, [api, lang, onClose, onForget]);

  const canOpenProfile = !!(onOpenProfile && registrationId);
  const readParts = (): Part[] => [
    keyPart(lang, 'save_panel.title'),
    keyPart(lang, 'save_panel.explanation'),
    canOpenProfile && keyPart(lang, 'save_panel.profile_title'),
    canOpenProfile && keyPart(lang, 'save_panel.profile_explanation'),
    keyPart(lang, 'save_panel.forget_title'),
    keyPart(lang, 'save_panel.forget_explanation'),
  ];

  return (
    <Dialog
      open={open}
      onClose={() => {
        setConfirmingForget(false);
        onClose();
      }}
      title={t(lang, 'save_panel.title')}
      className="bo-save-panel-dialog"
      lang={lang}
      readParts={readParts}
    >
      <div
        className="bo-save-panel-content"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}
      >
        <p style={{ margin: 0 }}>{t(lang, 'save_panel.explanation')}</p>

        {canOpenProfile && (
          <Card style={{ background: 'var(--bo-surface)' }}>
            <h3 style={{ margin: '0 0 var(--bo-space-2) 0', fontSize: '1em', fontWeight: 700 }}>
              {t(lang, 'save_panel.profile_title')}
            </h3>
            <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-3) 0' }}>
              {t(lang, 'save_panel.profile_explanation')}
            </p>
            <Button
              variant="link"
              onClick={() => {
                onClose();
                onOpenProfile?.();
              }}
            >
              {t(lang, 'profile.open')}
            </Button>
          </Card>
        )}

        <Card style={{ background: 'var(--bo-surface)' }}>
          <h3 style={{ margin: '0 0 var(--bo-space-2) 0', fontSize: '1em', fontWeight: 700 }}>
            {t(lang, 'save_panel.forget_title')}
          </h3>
          <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-3) 0' }}>
            {t(lang, 'save_panel.forget_explanation')}
          </p>

          {!confirmingForget ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmingForget(true)}
              style={{ color: 'var(--bo-error)', borderColor: 'var(--bo-error)' }}
            >
              {t(lang, 'save_panel.forget_title')}
            </Button>
          ) : (
            <div
              style={{
                padding: 'var(--bo-space-3)',
                background: 'var(--bo-error-bg)',
                borderRadius: 'var(--bo-radius)',
              }}
            >
              <p
                style={{
                  margin: '0 0 var(--bo-space-3) 0',
                  fontWeight: 600,
                  color: 'var(--bo-error)',
                }}
              >
                {t(lang, 'save_panel.forget_confirm')}
              </p>
              <div className="bo-actions">
                <Button
                  variant="primary"
                  onClick={() => void handleForget()}
                  style={{ background: 'var(--bo-error)', borderColor: 'var(--bo-error)' }}
                >
                  {t(lang, 'save_panel.forget_action')}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingForget(false)}>
                  {t(lang, 'save_panel.cancel')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="bo-actions">
          <Button variant="secondary" onClick={onClose}>
            {t(lang, 'common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
