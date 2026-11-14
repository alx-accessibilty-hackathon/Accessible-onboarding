import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LearnerSession } from '../api/auth';
import type { ApiConfig } from '../api/client';
import { ApplyFlow } from '../careers/ApplyFlow';
import { JobsPage } from '../careers/JobsPage';
import type { Job } from '../careers/match';
import { Button } from '../components/Button';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
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
  | { name: 'language' }
  | { name: 'signup' }
  | { name: 'jobs' }
  | { name: 'apply'; jobId: string; job?: Job | null }
  | { name: 'unknown' };

function initialView(flow: string | undefined, jobId: string | undefined): View {
  switch (flow || 'signup') {
    case 'signup':
      return { name: 'signup' };
    case 'language':
      return { name: 'language' };
    case 'jobs':
      return { name: 'jobs' };
    case 'job-application':
      return jobId ? { name: 'apply', jobId } : { name: 'jobs' };
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
  const { lang, simple, dir, t, setLang, setSimple } = useLanguage();
  const [view, setView] = useState<View>(() => initialView(props.flow, props.jobId));
  const [session, setSession] = useState<LearnerSession | null>(null);
  const [saveKey, setSaveKey] = useState(0);
  const [signupKey, setSignupKey] = useState(0);
  // A job the person wanted to apply for before signing up: offered again on Done.
  const [pendingJob, setPendingJob] = useState<{ jobId: string; job?: Job | null } | null>(null);

  const manageTitle = readFlag(props.manageTitle, hostOf(props.container), 'manage-title', true);

  const api = useMemo<ApiConfig>(
    () => ({ origin: props.api ?? '', partnerKey: props.partner ?? '' }),
    [props.api, props.partner],
  );
  const config = useWidgetConfig(api);

  // Events out (W5): bubbles + composed, no personal data in `detail`.
  const emitEvent = useCallback((name: WidgetEvent, detail: object = {}) => {
    if (rootRef.current) emit(rootRef.current, name, detail);
  }, []);

  // `ready` once, when the widget is on the page.
  useEffect(() => {
    emitEvent('ready', { flow: props.flow || 'signup' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLanguageScreenContinue = (cfg: { lang: string; simple: boolean }) => {
    setLang(cfg.lang);
    setSimple(cfg.simple);
    setView({ name: 'signup' });
  };

  const learnerApi = session ? { ...api, token: session.token } : null;

  return (
    <div ref={rootRef} className={simple ? 'bo-root bo-simple' : 'bo-root'} lang={lang} dir={dir}>
      <WidgetFrame
        help={config?.help}
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
              }
            : null
        }
      >
        {view.name === 'language' && (
          <LanguageScreen
            initialLang={lang}
            initialSimple={simple}
            onContinue={handleLanguageScreenContinue}
          />
        )}

        {view.name === 'signup' && (
          <SignupFlow
            key={signupKey}
            api={api}
            lang={lang}
            simple={simple}
            config={config}
            manageTitle={manageTitle}
            emit={emitEvent}
            onSession={setSession}
            onSaveState={() => setSaveKey((k) => k + 1)}
            doneExtra={
              pendingJob ? (
                <div className="bo-actions">
                  <Button
                    variant="primary"
                    onClick={() => setView({ name: 'apply', ...pendingJob })}
                  >
                    {t('apply.continue_application')}
                  </Button>
                </div>
              ) : null
            }
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

        {view.name === 'unknown' && <p className="bo-error-message">{t('errors.unknown_flow')}</p>}
      </WidgetFrame>
    </div>
  );
}

export function App(props: WidgetProps) {
  const initialLang = props.lang || DEFAULT_LANG;
  const initialSimple = readFlag(props.simple, hostOf(props.container), 'simple', false);

  return (
    <>
      {/* Styles live inside the shadow root, so the host page can't break them. */}
      <style>{css}</style>
      <LanguageProvider initialLang={initialLang} initialSimple={initialSimple}>
        <WidgetInner {...props} />
      </LanguageProvider>
    </>
  );
}
