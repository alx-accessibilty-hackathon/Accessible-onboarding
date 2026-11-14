import { useState, type ReactNode } from 'react';
import { LiveRegion } from '../a11y/LiveRegion';
import type { ApiConfig } from '../api/client';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { HelpPanel, type HelpContacts } from './HelpPanel';
import { SavePanel } from './SavePanel';
import { StatusBar } from './StatusBar';

export interface WidgetFrameProps {
  children: ReactNode;
  /** Sign-up in progress: shows "Save and finish later" and the save status. */
  saving?: {
    registrationId?: string;
    api?: ApiConfig | null; // with the learner token
    refreshKey?: number;
    onForget?: () => void;
  } | null;
  help?: HelpContacts | null;
}

// The same frame on every screen (WCAG 3.2.3 / 3.2.6). It lives inside the host page, so it
// uses no landmarks of its own (no header/main/footer): one labelled section for the widget.
export function WidgetFrame({ children, saving, help }: WidgetFrameProps) {
  const { lang, setLang, simple, toggleSimple, t } = useLanguage();

  const [saveOpen, setSaveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const otherLang = lang === 'en' ? 'am' : 'en';

  return (
    <section className="bo-frame" aria-label={t('frame.label')}>
      {/* Top bar: same place on every screen */}
      <div
        className="bo-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--bo-border-subtle)',
          paddingBottom: 'var(--bo-space-3)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bo-space-2)', alignItems: 'center' }}>
          {/* Language switch: the other language, named in its own script */}
          <Button
            variant="secondary"
            onClick={() => setLang(otherLang)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--bo-space-1)',
              padding: '0.4em 0.8em',
            }}
          >
            <Icon name="language" />
            <span lang={otherLang}>{otherLang === 'am' ? 'አማርኛ' : 'English'}</span>
          </Button>

          {/* Simple mode switch */}
          <Button
            variant="secondary"
            onClick={toggleSimple}
            aria-pressed={simple}
            style={{
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
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--bo-space-1)',
            padding: '0.4em 0.8em',
          }}
        >
          <Icon name="help" />
          <span>{t('header.help')}</span>
        </Button>
      </div>

      {/* Content (flows and screens) */}
      <div id="bo-main-content">{children}</div>

      {/* Save and finish later + status bar */}
      {saving && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bo-space-2)',
            borderTop: '1px solid var(--bo-border-subtle)',
            paddingTop: 'var(--bo-space-3)',
          }}
        >
          <div>
            <button type="button" className="bo-link" onClick={() => setSaveOpen(true)}>
              {t('common.save_later')}
            </button>
          </div>

          <StatusBar
            lang={lang}
            registrationId={saving.registrationId}
            refreshKey={saving.refreshKey}
          />
        </div>
      )}

      {/* Dialogs inside the shadow root */}
      <SavePanel
        open={saveOpen}
        lang={lang}
        onClose={() => setSaveOpen(false)}
        api={saving?.api}
        registrationId={saving?.registrationId}
        onForget={saving?.onForget}
      />

      <HelpPanel open={helpOpen} lang={lang} onClose={() => setHelpOpen(false)} help={help} />

      {/* One always-mounted Live Region (W1) */}
      <LiveRegion />
    </section>
  );
}
