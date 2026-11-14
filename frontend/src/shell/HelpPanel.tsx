import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { t } from '../i18n/t';

export interface HelpContacts {
  phone?: string;
  telegram?: string;
}

export interface HelpPanelProps {
  open: boolean;
  lang: string;
  onClose: () => void;
  /** From GET /config (`help`). */
  help?: HelpContacts | null;
}

function telegramUrl(handle: string): string {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://t.me/${handle.replace(/^@/, '')}`;
}

// SH-3: how to reach a person. Contacts come from the partner's config; nothing is sent.
export function HelpPanel({ open, lang, onClose, help }: HelpPanelProps) {
  const phone = help?.phone?.trim();
  const telegram = help?.telegram?.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t(lang, 'help_panel.title')}
      className="bo-help-panel-dialog"
    >
      <div className="bo-help-panel-content">
        {phone || telegram ? (
          <>
            <p>{t(lang, 'help_panel.intro')}</p>
            <Card
              style={{
                margin: 'var(--bo-space-3) 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--bo-space-3)',
              }}
            >
              {phone && (
                <p style={{ margin: 0 }}>
                  <strong>{t(lang, 'help_panel.phone')}</strong>{' '}
                  <a
                    href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                    style={{
                      color: 'var(--bo-primary)',
                      display: 'inline-block',
                      minHeight: 'var(--bo-target)',
                      paddingBlock: 'var(--bo-space-2)',
                    }}
                  >
                    {phone}
                  </a>
                </p>
              )}
              {telegram && (
                <p style={{ margin: 0 }}>
                  <strong>{t(lang, 'help_panel.telegram')}</strong>{' '}
                  <a
                    href={telegramUrl(telegram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--bo-primary)',
                      display: 'inline-block',
                      minHeight: 'var(--bo-target)',
                      paddingBlock: 'var(--bo-space-2)',
                    }}
                  >
                    {telegram}
                  </a>
                </p>
              )}
            </Card>
          </>
        ) : (
          <p>{t(lang, 'help_panel.none')}</p>
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
