import { keyPart, spellDigits } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
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

export function telegramUrl(handle: string): string {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://t.me/${handle.replace(/^@/, '')}`;
}

/** The help line as a tel: link. Its name keeps the number as shown (WCAG 2.5.3) and adds it
 * digit by digit, so screen readers don't say "two hundred and fifty-one". */
export function PhoneLink({ phone, lang }: { phone: string; lang: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      aria-label={t(lang, 'help_panel.phone_link', { number: `${phone} (${spellDigits(phone)})` })}
      style={{
        color: 'var(--bo-primary)',
        display: 'inline-block',
        minHeight: 'var(--bo-target)',
        paddingBlock: 'var(--bo-space-2)',
      }}
    >
      {phone}
    </a>
  );
}

export function TelegramLink({ telegram }: { telegram: string }) {
  return (
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
  );
}

/** What the help panel says aloud. The contacts are the partner's (fixed), not the learner's. */
export function helpParts(lang: string, help?: HelpContacts | null): Part[] {
  const phone = help?.phone?.trim();
  const telegram = help?.telegram?.trim();
  if (!phone && !telegram) return [keyPart(lang, 'help_panel.none')];
  return [
    keyPart(lang, 'help_panel.intro'),
    phone && keyPart(lang, 'help_panel.phone'),
    phone && spellDigits(phone),
    telegram && keyPart(lang, 'help_panel.telegram'),
    telegram,
  ];
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
      lang={lang}
      readParts={() => [keyPart(lang, 'help_panel.title'), ...helpParts(lang, help)]}
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
                  <PhoneLink phone={phone} lang={lang} />
                </p>
              )}
              {telegram && (
                <p style={{ margin: 0 }}>
                  <strong>{t(lang, 'help_panel.telegram')}</strong>{' '}
                  <TelegramLink telegram={telegram} />
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
