import { useEffect, useRef, useState } from 'react';
import { JobsPage } from '../careers/JobsPage';
import { FlowRunner } from '../engine/FlowRunner';
import { LanguageProvider, useLanguage } from '../i18n/LanguageContext';
import { LanguageScreen } from '../shell/LanguageScreen';
import { WidgetFrame } from '../shell/WidgetFrame';
import { emit } from './emit';
import css from './styles.css?inline';
import type { WidgetProps } from './types';

// Default to English; can be overridden by attribute or user switch
const DEFAULT_LANG = 'en';

function WidgetInner(props: WidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { lang, simple, dir, t, setLang, setSimple } = useLanguage();
  const [activeFlow, setActiveFlow] = useState(props.flow ?? 'signup');

  // Title management (W3: remember original title and restore it)
  useEffect(() => {
    if (!props.manageTitle || props.manageTitle === 'false') return;

    const originalTitle = document.title;
    return () => {
      document.title = originalTitle;
    };
  }, [props.manageTitle]);

  // Emit ready event on mount
  useEffect(() => {
    if (rootRef.current) {
      emit(rootRef.current, 'ready', { flow: activeFlow, lang });
    }
  }, [activeFlow, lang]);

  const handleLanguageScreenContinue = (cfg: { lang: string; simple: boolean }) => {
    setLang(cfg.lang);
    setSimple(cfg.simple);
    setActiveFlow(props.flow && props.flow !== 'language' ? props.flow : 'signup');
  };

  return (
    <div
      ref={rootRef}
      className={simple ? 'bo-root bo-simple' : 'bo-root'}
      lang={lang}
      dir={dir}
    >
      <WidgetFrame
        apiOrigin={props.api}
        partnerKey={props.partner}
      >
        {activeFlow === 'language' && (
          <LanguageScreen
            initialLang={lang}
            initialSimple={simple}
            onContinue={handleLanguageScreenContinue}
          />
        )}

        {activeFlow === 'signup' && (
          <FlowRunner flowId="signup" lang={lang} />
        )}

        {activeFlow === 'jobs' && (
          <JobsPage lang={lang} />
        )}

        {activeFlow === 'job-application' && (
          <FlowRunner flowId="job-application" lang={lang} />
        )}

        {activeFlow === 'employer-job' && (
          <FlowRunner flowId="employer-job" lang={lang} />
        )}

        {activeFlow !== 'signup' &&
          activeFlow !== 'jobs' &&
          activeFlow !== 'language' &&
          activeFlow !== 'job-application' &&
          activeFlow !== 'employer-job' && (
            <p className="bo-error-message">{t('errors.unknown_flow')}</p>
          )}
      </WidgetFrame>
    </div>
  );
}

export function App(props: WidgetProps) {
  const initialLang = props.lang ?? DEFAULT_LANG;
  const initialSimple = Boolean(props.simple);

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
