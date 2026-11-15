import { useState, type ReactNode } from 'react';
import { LiveRegion } from '../a11y/LiveRegion';
import type { ApiConfig } from '../api/client';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { HelpPanel, type HelpContacts } from './HelpPanel';
import { ModeToggles } from './ModeToggles';
import { ReadAloudNotice } from './ReadAloudNotice';
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
    /** "See or change my details": open the profile page. */
    onOpenProfile?: () => void;
  } | null;
  help?: HelpContacts | null;
  /** The languages offered (GET /config, else every language we have). */
  languages?: string[];
  /** The language screen is showing (before a language was chosen, or opened from here). */
  languageOpen?: boolean;
  /** Open the language screen. */
  onOpenLanguage?: () => void;
}

// The same frame on every screen (WCAG 3.2.3 / 3.2.6). It lives inside the host page, so it
// uses no landmarks of its own (no header/main/footer): one labelled section for the widget.
export function WidgetFrame({
  children,
  saving,
  help,
  languages = [],
  languageOpen = false,
  onOpenLanguage,
}: WidgetFrameProps) {
  const { lang, simple, toggleSimple, t } = useLanguage();

  const [saveOpen, setSaveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <section className="bo-frame" aria-label={t('frame.label')}>
      {/* Read aloud is on: it starts with the first key press or tap (until then, this says so) */}
      <ReadAloudNotice lang={lang} languages={languages.length > 0 ? languages : [lang]} />

      {/* Top bar: same place on every screen */}
      <div
        className="bo-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 'var(--bo-space-3)',
          borderBottom: '1px solid var(--bo-border-subtle)',
          paddingBottom: 'var(--bo-space-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--bo-space-2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--bo-space-2)',
              alignItems: 'center',
            }}
          >
            {/* Language: opens the language screen (named in English too, for anyone lost) */}
            {!languageOpen && onOpenLanguage && (
              <Button
                variant="secondary"
                onClick={onOpenLanguage}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--bo-space-1)',
                  padding: '0.4em 0.8em',
                }}
              >
                <Icon name="language" />
                <span>{t('header.language')}</span>
                {lang !== 'en' && (
                  <span lang="en">
                    <span aria-hidden="true">· </span>Language
                  </span>
                )}
              </Button>
            )}

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

        {/* Read aloud and Answer by speaking: on every screen, saved on this device */}
        <ModeToggles lang={lang} bilingual={languageOpen ? languages : null} />
      </div>

      {/* Content (flows and screens) */}
      <div id="bo-main-content">{children}</div>

      {/* Save and finish later + status bar */}
      {saving && !languageOpen && (
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
        onOpenProfile={saving?.onOpenProfile}
      />

      <HelpPanel open={helpOpen} lang={lang} onClose={() => setHelpOpen(false)} help={help} />

      {/* One always-mounted Live Region (W1) */}
      <LiveRegion />
    </section>
  );
}
