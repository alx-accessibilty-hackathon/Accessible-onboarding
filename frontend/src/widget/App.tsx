import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useFocusSpeech } from '../a11y/focusSpeech';
import { ModesProvider, ReadScope, useModes } from '../a11y/modes';
import {
  getChosenLanguage,
  getEffectiveTheme,
  scaleClass,
  scaleStyle,
  setChosenLanguage,
  useTextSize,
  useTheme,
} from '../a11y/settings';
import { configureSpeaker } from '../a11y/speaker';
import { loadSession, type LearnerSession } from '../api/auth';
import type { ApiConfig } from '../api/client';
import { patchRegistration } from '../api/registrations';
import { ApplyFlow } from '../careers/ApplyFlow';
import { JobsPage } from '../careers/JobsPage';
import type { Job } from '../careers/match';
import { Button } from '../components/Button';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
import { hasLanguage, offeredLanguages } from '../i18n/registry';
import { darkenHex, isAccessibleAgainstWhite } from '../lib/color';
import { ProfilePage } from '../profile/ProfilePage';
import { LanguageScreen } from '../shell/LanguageScreen';
import { WidgetFrame } from '../shell/WidgetFrame';
import { emit, type WidgetEvent } from './emit';
import { SignupFlow } from './SignupFlow';
import css from './styles.css?inline';
import { readFlag, type WidgetProps } from './types';
import { useWidgetConfig } from './useConfig';

// Default to English; can be overridden by attribute or user switch
const DEFAULT_LANG = 'en';

type View =
  | { name: 'signup' }
  | { name: 'jobs' }
  | { name: 'apply'; jobId: string; job?: Job | null }
  /** `opened`: the person came here with a button (focus moves to its heading). */
  | { name: 'profile'; opened?: boolean }
  | { name: 'unknown' };

function initialView(flow: string | undefined, jobId: string | undefined): View {
  switch (flow || 'signup') {
    case 'signup':
    case 'language': // the language screen, then sign-up
      return { name: 'signup' };
    case 'jobs':
      return { name: 'jobs' };
    case 'job-application':
      return jobId ? { name: 'apply', jobId } : { name: 'jobs' };
    case 'profile':
      return { name: 'profile' };
    default:
      return { name: 'unknown' };
  }
}

function hostOf(container: WidgetProps['container']): Element | null {
  if (!container) return null;
  return container instanceof ShadowRoot ? container.host : container;
}

function WidgetInner(props: WidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { lang, simple, dir, t, setLang, setSimple } = useLanguage();
  const { readAloud } = useModes();
  const textSize = useTextSize();
  const theme = useTheme();
  const effectiveTheme = getEffectiveTheme(theme);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', effectiveTheme);
    }
  }, [effectiveTheme]);

  const [view, setView] = useState<View>(() => initialView(props.flow, props.jobId));
  const [session, setSession] = useState<LearnerSession | null>(null);
  const [saveKey, setSaveKey] = useState(0);
  const [signupKey, setSignupKey] = useState(0);
  // A job the person wanted to apply for before signing up: offered again on Done.
  const [pendingJob, setPendingJob] = useState<{ jobId: string; job?: Job | null } | null>(null);

  // Language first: until a language has been chosen on this device, nothing else shows.
  const [languageOpen, setLanguageOpen] = useState(
    () => props.flow === 'language' || !getChosenLanguage(),
  );
  const [languageByPerson, setLanguageByPerson] = useState(false); // opened from the header
  const focusContentRef = useRef(false);

  const manageTitle = readFlag(props.manageTitle, hostOf(props.container), 'manage-title', true);

  const api = useMemo<ApiConfig>(
    () => ({ origin: props.api ?? '', partnerKey: props.partner ?? '' }),
    [props.api, props.partner],
  );
  const { config, reload: reloadConfig } = useWidgetConfig(api);
  const languages = useMemo(() => offeredLanguages(config?.languages), [config?.languages]);

  // The server voice (fixed text only) speaks for this partner.
  useEffect(() => {
    configureSpeaker(api);
  }, [api]);

  // Read aloud mode: say the element the person moves to, and what they select.
  useFocusSpeech(rootRef, lang, readAloud);

  // Events out (W5): bubbles + composed, no personal data in `detail`.
  const emitEvent = useCallback((name: WidgetEvent, detail: object = {}) => {
    if (rootRef.current) emit(rootRef.current, name, detail);
  }, []);

  // `ready` once, when the widget is on the page.
  useEffect(() => {
    emitEvent('ready', { flow: props.flow || 'signup' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply partner primary theme color if it passes WCAG AA 4.5:1 contrast against white.
  const themeStyle = useMemo<CSSProperties>(() => {
    const primary = config?.theme?.primary?.trim();
    if (!primary) return {};
    if (!isAccessibleAgainstWhite(primary)) {
      console.warn(
        `[theme] Partner primary color "${primary}" fails WCAG AA 4.5:1 contrast against white; using default accessible color.`,
      );
      return {};
    }
    const hover = darkenHex(primary, 0.15);
    return {
      '--bo-primary': primary,
      ...(hover ? { '--bo-primary-hover': hover } : {}),
    } as CSSProperties;
  }, [config?.theme?.primary]);

  // Use partner default_language as initial fallback before 'en' when the user hasn't chosen a language.
  useEffect(() => {
    if (
      config?.default_language &&
      !getChosenLanguage() &&
      !props.lang &&
      hasLanguage(config.default_language) &&
      lang !== config.default_language
    ) {
      setLang(config.default_language);
    }
  }, [config?.default_language, props.lang, lang, setLang]);

  // Only one language offered: there is nothing to choose.
  useEffect(() => {
    if (languageOpen && !languageByPerson && languages.length === 1 && config) {
      setLang(languages[0]);
      setLanguageOpen(false);
    }
  }, [languageOpen, languageByPerson, languages, config, setLang]);

  // After the language screen, the person is taken to the heading of what is behind it.
  useEffect(() => {
    if (languageOpen || !focusContentRef.current) return;
    focusContentRef.current = false;
    contentRef.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [languageOpen]);

  const handleLanguageScreenContinue = (cfg: { lang: string; simple: boolean }) => {
    setChosenLanguage(cfg.lang);
    setLang(cfg.lang);
    setSimple(cfg.simple);
    setLanguageOpen(false);
    focusContentRef.current = true;
    // The sign-up flow tells the account itself; elsewhere, tell it here (best effort).
    if (view.name !== 'signup' && cfg.lang !== lang) {
      void loadSession()
        .then((s) =>
          s
            ? patchRegistration({ ...api, token: s.token }, s.registrationId, {
                language: cfg.lang,
              })
            : undefined,
        )
        .catch(() => {});
    }
  };

  const learnerApi = session ? { ...api, token: session.token } : null;
  const openProfile = () => setView({ name: 'profile', opened: true });

  return (
    <div
      ref={rootRef}
      className={(simple ? 'bo-root bo-simple' : 'bo-root') + scaleClass(textSize)}
      data-theme={theme !== 'system' ? theme : undefined}
      lang={lang}
      dir={dir}
      style={{ ...scaleStyle(textSize), ...themeStyle }}
    >
      <WidgetFrame
        help={config?.help}
        languages={languages}
        languageOpen={languageOpen}
        onOpenLanguage={
          languages.length > 1
            ? () => {
                setLanguageByPerson(true);
                setLanguageOpen(true);
              }
            : undefined
        }
        saving={
          view.name === 'signup'
            ? {
                registrationId: session?.registrationId,
                api: learnerApi,
                refreshKey: saveKey,
                onForget: () => {
                  setSession(null);
                  setPendingJob(null);
                  setSignupKey((k) => k + 1); // start again, without reloading the host page
                },
                onOpenProfile: openProfile,
              }
            : null
        }
      >
        {languageOpen && (
          <LanguageScreen
            initialLang={lang}
            initialSimple={simple}
            languages={languages}
            focusOnMount={languageByPerson}
            onContinue={handleLanguageScreenContinue}
          />
        )}

        {/* Kept on the page (answers, a job being read) while the language screen shows. */}
        <ReadScope active={!languageOpen}>
          <div ref={contentRef} hidden={languageOpen}>
            {view.name === 'signup' && (
              <SignupFlow
                key={signupKey}
                api={api}
                lang={lang}
                simple={simple}
                config={config}
                onReloadConfig={reloadConfig}
                manageTitle={manageTitle}
                emit={emitEvent}
                onSession={setSession}
                onSaveState={() => setSaveKey((k) => k + 1)}
                doneExtra={
                  <div className="bo-actions">
                    {pendingJob && (
                      <Button
                        variant="primary"
                        onClick={() => setView({ name: 'apply', ...pendingJob })}
                      >
                        {t('apply.continue_application')}
                      </Button>
                    )}
                    {/* What the Done screen says you can do now */}
                    {!pendingJob && (
                      <Button variant="secondary" onClick={() => setView({ name: 'jobs' })}>
                        {t('jobs.title')}
                      </Button>
                    )}
                    <Button variant="link" onClick={openProfile}>
                      {t('profile.open')}
                    </Button>
                  </div>
                }
              />
            )}

            {view.name === 'profile' && (
              <ProfilePage
                api={api}
                lang={lang}
                languages={languages}
                manageTitle={manageTitle}
                focusOnMount={!!view.opened}
                onSignUp={() => setView({ name: 'signup' })}
                onLanguage={(l) => {
                  setChosenLanguage(l);
                  setLang(l);
                }}
                onSimple={setSimple}
                onDeleted={() => {
                  setSession(null);
                  setPendingJob(null);
                  setSignupKey((k) => k + 1); // a new, empty sign-up if they come back
                }}
              />
            )}

            {view.name === 'jobs' && (
              <JobsPage
                lang={lang}
                api={api}
                manageTitle={manageTitle}
                onApply={(job) => setView({ name: 'apply', jobId: job.id, job })}
              />
            )}

            {view.name === 'apply' && (
              <ApplyFlow
                key={view.jobId}
                api={api}
                lang={lang}
                jobId={view.jobId}
                job={view.job}
                manageTitle={manageTitle}
                emit={emitEvent}
                onBackToJobs={() => setView({ name: 'jobs' })}
                onSignUp={() => {
                  setPendingJob({ jobId: view.jobId, job: view.job });
                  setView({ name: 'signup' });
                }}
              />
            )}

            {view.name === 'unknown' && (
              <p className="bo-error-message">{t('errors.unknown_flow')}</p>
            )}
          </div>
        </ReadScope>
      </WidgetFrame>
    </div>
  );
}

export function App(props: WidgetProps) {
  // The language chosen on this device wins; then the page's `lang`; then English.
  const chosen = getChosenLanguage();
  const initialLang =
    chosen && hasLanguage(chosen)
      ? chosen
      : props.lang && hasLanguage(props.lang)
        ? props.lang
        : DEFAULT_LANG;
  const initialSimple = readFlag(props.simple, hostOf(props.container), 'simple', false);

  return (
    <>
      {/* Styles live inside the shadow root, so the host page can't break them. */}
      <style>{css}</style>
      <LanguageProvider initialLang={initialLang} initialSimple={initialSimple}>
        <ModesProvider>
          <WidgetInner {...props} />
        </ModesProvider>
      </LanguageProvider>
    </>
  );
}
