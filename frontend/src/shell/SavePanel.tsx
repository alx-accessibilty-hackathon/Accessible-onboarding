import { useCallback, useState } from 'react';
import { announce } from '../a11y/announce';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { forgetEverything, logout } from '../api/auth';
import type { ApiConfig } from '../api/client';
import { createResumeLink, type ResumeLink } from '../api/registrations';
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
  const [resumeLink, setResumeLink] = useState<ResumeLink | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const canContinueElsewhere = !!(api?.token && registrationId);

  const handleGetLink = useCallback(async () => {
    if (!api?.token || !registrationId) return;
    setLoadingLink(true);
    setLinkError(null);
    try {
      const link = await createResumeLink(api, registrationId);
      setResumeLink(link);
    } catch {
      setLinkError('network');
    } finally {
      setLoadingLink(false);
    }
  }, [api, registrationId]);

  const handleCopyCode = useCallback(async () => {
    if (!resumeLink?.code) return;
    try {
      await navigator.clipboard.writeText(resumeLink.code);
      setCopiedCode(true);
      announce(t(lang, 'save_panel.code_copied'));
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // clipboard blocked
    }
  }, [resumeLink?.code, lang]);

  const handleCopyLink = useCallback(async () => {
    if (!resumeLink?.url) return;
    try {
      await navigator.clipboard.writeText(resumeLink.url);
      setCopiedLink(true);
      announce(t(lang, 'save_panel.link_copied'));
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // clipboard blocked
    }
  }, [resumeLink?.url, lang]);

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
    canContinueElsewhere && keyPart(lang, 'save_panel.continue_title'),
    canContinueElsewhere && keyPart(lang, 'save_panel.continue_explanation'),
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

        {canContinueElsewhere && (
          <Card style={{ background: 'var(--bo-surface)' }}>
            <h3 style={{ margin: '0 0 var(--bo-space-2) 0', fontSize: '1em', fontWeight: 700 }}>
              {t(lang, 'save_panel.continue_title')}
            </h3>
            <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-3) 0' }}>
              {t(lang, 'save_panel.continue_explanation')}
            </p>
            {!resumeLink ? (
              <Button
                variant="secondary"
                onClick={() => void handleGetLink()}
                disabled={loadingLink}
              >
                {loadingLink ? t(lang, 'common.loading') : t(lang, 'save_panel.get_link_button')}
              </Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9em',
                      marginBottom: 'var(--bo-space-1)',
                    }}
                  >
                    {t(lang, 'save_panel.code_label')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--bo-space-2)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '1.2em',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        letterSpacing: '0.1em',
                        background: 'var(--bo-bg)',
                        padding: 'var(--bo-space-1) var(--bo-space-2)',
                        borderRadius: 'var(--bo-radius)',
                        border: '1px solid var(--bo-border)',
                      }}
                    >
                      {resumeLink.code}
                    </span>
                    <Button variant="secondary" onClick={() => void handleCopyCode()}>
                      {copiedCode
                        ? t(lang, 'save_panel.code_copied')
                        : t(lang, 'save_panel.copy_code')}
                    </Button>
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9em',
                      marginBottom: 'var(--bo-space-1)',
                    }}
                  >
                    {t(lang, 'save_panel.link_label')}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--bo-space-2)',
                      flexWrap: 'wrap',
                    }}
                  >
                    <a
                      href={resumeLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ wordBreak: 'break-all', fontSize: '0.9em' }}
                    >
                      {resumeLink.url}
                    </a>
                    <Button variant="secondary" onClick={() => void handleCopyLink()}>
                      {copiedLink
                        ? t(lang, 'save_panel.link_copied')
                        : t(lang, 'save_panel.copy_link')}
                    </Button>
                  </div>
                </div>

                {resumeLink.expires_at && (
                  <p className="bo-hint" style={{ margin: 0, fontSize: '0.85em' }}>
                    {t(lang, 'save_panel.link_expires', {
                      date: new Date(resumeLink.expires_at).toLocaleDateString(lang),
                    })}
                  </p>
                )}
              </div>
            )}
            {linkError && (
              <p
                style={{
                  margin: 'var(--bo-space-2) 0 0 0',
                  color: 'var(--bo-error)',
                  fontSize: '0.9em',
                }}
              >
                {t(lang, `errors.${linkError}`)}
              </p>
            )}
          </Card>
        )}

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
