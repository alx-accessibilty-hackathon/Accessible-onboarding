import { useState, type ReactNode } from 'react';
import { LiveRegion } from '../a11y/LiveRegion';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { HelpPanel } from './HelpPanel';
import { SavePanel } from './SavePanel';
import { StatusBar } from './StatusBar';

export interface WidgetFrameProps {
  children: ReactNode;
  registrationId?: string;
  apiOrigin?: string;
  partnerKey?: string;
  onResetSession?: () => void;
}

// The same frame on every screen (WCAG 3.2.3 / 3.2.6).
export function WidgetFrame({
  children,
  registrationId,
  apiOrigin,
  partnerKey,
  onResetSession,
}: WidgetFrameProps) {
  const { lang, setLang, simple, toggleSimple, t } = useLanguage();

  const [saveOpen, setSaveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleLanguage = () => {
    setLang(lang === 'en' ? 'am' : 'en');
  };

  return (
    <div className="bo-frame">
      {/* Top Header: same place on every screen */}
      <header
        className="bo-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--bo-border-subtle)',
          paddingBottom: 'var(--bo-space-3)',
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--bo-space-2)', alignItems: 'center' }}>
          {/* Language switch */}
          <Button
            variant="secondary"
            onClick={toggleLanguage}
            style={{
              minHeight: 'var(--bo-target)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--bo-space-1)',
              padding: '0.4em 0.8em',
            }}
          >
            <Icon name="language" />
            <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
          </Button>

          {/* Simple mode switch */}
          <Button
            variant="secondary"
            onClick={toggleSimple}
            aria-pressed={simple}
            style={{
              minHeight: 'var(--bo-target)',
              padding: '0.4em 0.8em',
              background: simple ? 'var(--bo-selected-bg)' : undefined,
              borderColor: simple ? 'var(--bo-primary)' : undefined,
            }}
          >
            <span>{t('header.simple_mode')}</span>
          </Button>
        </div>

        {/* Get help from a person */}
        <Button
          variant="secondary"
          onClick={() => setHelpOpen(true)}
          style={{
            minHeight: 'var(--bo-target)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--bo-space-1)',
            padding: '0.4em 0.8em',
          }}
        >
          <Icon name="help" />
          <span>{t('header.help')}</span>
        </Button>
      </header>

      {/* Main content slot (flows and screens) */}
      <main id="bo-main-content">
        {children}
      </main>

      {/* Footer controls: Save and finish later + Status Bar */}
      <footer
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--bo-space-2)',
          borderTop: '1px solid var(--bo-border-subtle)',
          paddingTop: 'var(--bo-space-3)',
          marginTop: 'var(--bo-space-4)',
        }}
      >
        <div>
          <button
            type="button"
            className="bo-link"
            onClick={() => setSaveOpen(true)}
          >
            {t('common.save_later')}
          </button>
        </div>

        <StatusBar lang={lang} registrationId={registrationId} />
      </footer>

      {/* Modals inside shadow root */}
      <SavePanel
        open={saveOpen}
        lang={lang}
        onClose={() => setSaveOpen(false)}
        onResetSession={onResetSession}
      />

      <HelpPanel
        open={helpOpen}
        lang={lang}
        onClose={() => setHelpOpen(false)}
        apiOrigin={apiOrigin}
        partnerKey={partnerKey}
        registrationId={registrationId}
      />

      {/* One always-mounted Live Region (W1) */}
      <LiveRegion />
    </div>
  );
}
