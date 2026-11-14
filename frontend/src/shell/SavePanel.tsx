import { useCallback, useState } from 'react';
import { announce } from '../a11y/announce';
import { forgetEverything, logout } from '../api/auth';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import { createResumeLink, type ResumeLink } from '../api/registrations';
import { Banner } from '../components/Banner';
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
}

export function SavePanel({ open, lang, onClose, api, registrationId, onForget }: SavePanelProps) {
  const [confirmingForget, setConfirmingForget] = useState(false);
  const [link, setLink] = useState<ResumeLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

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
    setLink(null);
    onClose();
    onForget?.();
  }, [api, lang, onClose, onForget]);

  const handleGetLink = useCallback(async () => {
    if (!api || !registrationId) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const res = await createResumeLink(api, registrationId, { send_via: 'none' });
      setLink(res);
      announce(t(lang, 'save_panel.link_ready'));
    } catch (err) {
      const code =
        err instanceof ApiError && (err.status === 404 || err.status === 501)
          ? 'not_implemented'
          : errorCode(err);
      setLinkError(code);
    } finally {
      setLinkLoading(false);
    }
  }, [api, registrationId, lang]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setConfirmingForget(false);
        onClose();
      }}
      title={t(lang, 'save_panel.title')}
      className="bo-save-panel-dialog"
    >
      <div
        className="bo-save-panel-content"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}
      >
        <p style={{ margin: 0 }}>{t(lang, 'save_panel.explanation')}</p>

        {api?.token && registrationId && (
          <Card style={{ background: 'var(--bo-surface)' }}>
            <h3 style={{ margin: '0 0 var(--bo-space-2) 0', fontSize: '1em', fontWeight: 700 }}>
              {t(lang, 'save_panel.other_device_title')}
            </h3>
            <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-3) 0' }}>
              {t(lang, 'save_panel.other_device_explanation')}
            </p>
            {linkError && (
              <div style={{ marginBottom: 'var(--bo-space-3)' }}>
                <Banner variant="error">{t(lang, `errors.${linkError}`)}</Banner>
              </div>
            )}
            {link ? (
              <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
                <dt style={{ fontWeight: 700 }}>{t(lang, 'save_panel.code')}</dt>
                <dd style={{ margin: 0, fontSize: '1.5em', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                  {link.code}
                </dd>
                <dt style={{ fontWeight: 700 }}>{t(lang, 'save_panel.link')}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  <a href={link.url} style={{ color: 'var(--bo-primary)' }}>
                    {link.url}
                  </a>
                </dd>
                <dt className="bo-hint">{t(lang, 'save_panel.expires')}</dt>
                <dd className="bo-hint" style={{ margin: 0 }}>
                  {new Date(link.expires_at).toLocaleString(lang === 'am' ? 'am-ET' : 'en-GB')}
                </dd>
              </dl>
            ) : (
              <Button variant="secondary" onClick={() => void handleGetLink()} disabled={linkLoading}>
                {t(lang, linkLoading ? 'common.sending' : 'save_panel.get_link')}
              </Button>
            )}
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
              <p style={{ margin: '0 0 var(--bo-space-3) 0', fontWeight: 600, color: 'var(--bo-error)' }}>
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
