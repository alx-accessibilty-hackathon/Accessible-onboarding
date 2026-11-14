import { useEffect, useRef } from 'react';
import { JobsPage } from '../careers/JobsPage';
import { FlowRunner } from '../engine/FlowRunner';
import { directionOf, t } from '../i18n/t';
import { WidgetFrame } from '../shell/WidgetFrame';
import { emit } from './emit';
import css from './styles.css?inline';
import type { WidgetProps } from './types';

// TODO: default to 'am' once am.json is translated (until then Amharic falls back to English).
const DEFAULT_LANG = 'en';

export function App(props: WidgetProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const flow = props.flow ?? 'signup';
  const lang = props.lang ?? DEFAULT_LANG;

  useEffect(() => {
    if (rootRef.current) emit(rootRef.current, 'ready', { flow });
  }, [flow]);

  return (
    <>
      {/* Styles live inside the shadow root, so the host page can't break them. */}
      <style>{css}</style>
      <div
        ref={rootRef}
        className={props.simple ? 'bo-root bo-simple' : 'bo-root'}
        lang={lang}
        dir={directionOf(lang)}
      >
        <WidgetFrame>
          {flow === 'signup' && <FlowRunner flowId="signup" lang={lang} />}
          {flow === 'jobs' && <JobsPage lang={lang} />}
          {/* TODO: resume (FB, Should), job-application (FA-9), employer-job (FA-10), partner-signup (E1) */}
          {flow !== 'signup' && flow !== 'jobs' && <p>{t(lang, 'errors.unknown_flow')}</p>}
        </WidgetFrame>
      </div>
    </>
  );
}
