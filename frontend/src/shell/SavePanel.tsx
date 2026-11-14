import { useCallback, useState } from 'react';
import { announce } from '../a11y/announce';
import { clearSession } from '../api/auth';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface SavePanelProps {
  open: boolean;
  lang: string;
  onClose: () => void;
  onResetSession?: () => void;
}

export function SavePanel({
  open,
  lang,
  onClose,
  onResetSession,
}: SavePanelProps) {
  const [confirmingForget, setConfirmingForget] = useState(false);

  const handleForget = useCallback(async () => {
    try {
      await clearSession();
      announce(t(lang, 'save_panel.forgot_done'));
      setConfirmingForget(false);
      onClose();
      if (onResetSession) {
        onResetSession();
      } else {
        window.location.reload();
      }
    } catch {
      // ignore
    }
  }, [lang, onClose, onResetSession]);

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
      <div className="bo-save-panel-content">
        <p>{t(lang, 'save_panel.explanation')}</p>

        <Card style={{ marginTop: 'var(--bo-space-4)', background: 'var(--bo-surface)' }}>
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
            <div style={{ padding: 'var(--bo-space-3)', background: 'var(--bo-error-bg)', borderRadius: 'var(--bo-radius)' }}>
              <p style={{ margin: '0 0 var(--bo-space-3) 0', fontWeight: 600, color: 'var(--bo-error)' }}>
                {t(lang, 'save_panel.forget_confirm')}
              </p>
              <div className="bo-actions">
                <Button
                  variant="primary"
                  onClick={handleForget}
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

        <div className="bo-actions" style={{ marginTop: 'var(--bo-space-5)' }}>
          <Button variant="secondary" onClick={onClose}>
            {t(lang, 'common.close')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
