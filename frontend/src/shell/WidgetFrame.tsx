import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { announce } from '../a11y/announce';
import { describeElement } from '../a11y/focusSpeech';
import { LiveRegion } from '../a11y/LiveRegion';
import { FrameReadProvider } from '../a11y/modes';
import type { Part } from '../a11y/speaker';
import { serverWaking, subscribeServerWaking, type ApiConfig } from '../api/client';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useLanguage } from '../i18n/LanguageContext';
import { t as tr } from '../i18n/t';
import { HelpPanel, type HelpContacts } from './HelpPanel';
import { Label, ModeToggles, ThemeToggle } from './ModeToggles';
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

/** "Connecting to the service…" while a reading request waits for the server to wake up. */
function WakingNotice({ lang }: { lang: string }) {
  const waking = useSyncExternalStore(subscribeServerWaking, serverWaking, serverWaking);
  useEffect(() => {
    if (waking) announce(tr(lang, 'status.waking'));
  }, [waking, lang]);
  if (!waking) return null;
  return (
    <div className="bo-banner bo-banner-info bo-notice">
      <Icon name="info" className="bo-banner-icon" />
      <p className="bo-banner-body" style={{ margin: 0 }}>
        {tr(lang, 'status.waking')}
      </p>
    </div>
  );
}

const BAR_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--bo-space-1)',
  padding: '0.4em 0.8em',
} as const;

// A button in the top bar: size, padding and gaps come from `.bo-bar` in styles.css.
const BAR_ITEM = { display: 'inline-flex', alignItems: 'center' } as const;

// The same frame on every screen (WCAG 3.2.3 / 3.2.6). It lives inside the host page, so it
// uses no landmarks of its own (no header/main/footer): one labelled section for the widget.
//
// Top bar: Get help, Language (when more than one is offered), Dark mode and Accessibility.
// Accessibility opens a panel right below it, next in the Tab order, with Read aloud, Answer by
// speaking, the text size and Simple mode. It is a disclosure (a button with aria-expanded and
// a panel that is hidden when closed), not a menu: the controls in it are tried out one by one
// and the panel stays open until it is closed (Close, Escape, or the button again).
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
  const [menuOpen, setMenuOpen] = useState(false);
  const panelId = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Before a language is chosen, the labels are in every offered language.
  const bilingual = languageOpen ? languages : null;

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !menuOpen) return;
    e.preventDefault();
    closeMenu();
  };

  // Escape anywhere inside the open panel closes it (a native listener: the panel itself is
  // not a control, its buttons are).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !menuOpen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    panel.addEventListener('keydown', onKey);
    return () => panel.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Read aloud: the first reading of the page starts with the top bar, in screen order.
  const frameParts = useCallback((): Part[] => {
    const bar = barRef.current;
    if (!bar) return [];
    const parts: Part[] = [];
    bar.querySelectorAll<HTMLElement>('button, a[href]').forEach((el) => {
      if (el.closest('[hidden]')) return;
      parts.push(...describeElement(el, lang));
      if (el.getAttribute('aria-expanded') === 'false') {
        parts.push({ text: t('speech.hint.open'), key: 'speech.hint.open' });
      }
    });
    return parts;
  }, [lang, t]);

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
          ref={barRef}
          // .bo-bar: compact buttons, so the four fit on one line (they still wrap on a narrow
          // phone or at large text sizes: the page must never scroll sideways)
          className="bo-bar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            alignItems: 'center',
          }}
        >
          {/* Get help from a person */}
          <Button variant="secondary" onClick={() => setHelpOpen(true)} style={BAR_ITEM}>
            <Icon name="help" />
            <Label lang={lang} k="header.help" bilingual={bilingual} stacked />
          </Button>

          {/* Language: opens the language screen. Not while the language screen is showing.
              The globe icon marks it in any language; its name also says "Language" in
              English to read aloud and screen readers, for anyone lost in a language they
              can't read (not shown, so the bar stays on one line). */}
          {!languageOpen && onOpenLanguage && (
            <Button variant="secondary" onClick={onOpenLanguage} style={BAR_ITEM}>
              <Icon name="language" />
              <span>{t('header.language')}</span>
              {lang !== 'en' && (
                <span lang="en" className="bo-visually-hidden">
                  Language
                </span>
              )}
            </Button>
          )}

          <ThemeToggle lang={lang} bilingual={bilingual} compact />

          {/* Accessibility: in the chosen language (in every offered one on the language screen) */}
          <Button
            ref={menuButtonRef}
            variant="secondary"
            aria-expanded={menuOpen}
            aria-controls={panelId}
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={onMenuKeyDown}
            style={{
              ...BAR_ITEM,
              background: menuOpen ? 'var(--bo-selected-bg)' : undefined,
              borderColor: menuOpen ? 'var(--bo-primary)' : undefined,
            }}
          >
            <Icon name="accessibility" />
            <Label lang={lang} k="header.accessibility" bilingual={bilingual} stacked />
            <Icon name={menuOpen ? 'expand_less' : 'expand_more'} />
          </Button>
        </div>

        {/* The Accessibility panel: right after its button, so the Tab order matches the screen */}
        <div
          ref={panelRef}
          id={panelId}
          hidden={!menuOpen}
          className="bo-card bo-a11y-panel"
          style={{
            display: menuOpen ? 'flex' : 'none',
            flexDirection: 'column',
            gap: 'var(--bo-space-3)',
          }}
        >
          {/* Read aloud, Answer by speaking, text size: saved on this device */}
          <ModeToggles lang={lang} bilingual={bilingual} theme={false} />

          {/* Simple mode (the language screen has its own choice for it) */}
          {!languageOpen && (
            <div>
              <Button
                variant="secondary"
                onClick={toggleSimple}
                aria-pressed={simple}
                style={{
                  ...BAR_BUTTON,
                  background: simple ? 'var(--bo-selected-bg)' : undefined,
                  borderColor: simple ? 'var(--bo-primary)' : undefined,
                }}
              >
                <span>{t('header.simple_mode')}</span>
                {simple && <Icon name="check" style={{ color: 'var(--bo-primary)' }} />}
              </Button>
            </div>
          )}

          <div>
            <Button variant="secondary" onClick={closeMenu}>
              <Label lang={lang} k="common.close" bilingual={bilingual} />
            </Button>
          </div>
        </div>
      </div>

      {/* The hosted service is waking up (a request is taking long): say so, don't look stuck */}
      <WakingNotice lang={lang} />

      {/* Content (flows and screens) */}
      <FrameReadProvider value={frameParts}>
        <div id="bo-main-content">{children}</div>
      </FrameReadProvider>

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
