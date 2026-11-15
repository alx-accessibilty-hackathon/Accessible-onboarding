import employerJob from '@shared/flows/employer-job.json';
import jobApplication from '@shared/flows/job-application.json';
import signup from '@shared/flows/signup.json';
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';
import { announce } from '../a11y/announce';
import { focusHeading } from '../a11y/focus';
import { useAutoRead } from '../a11y/modes';
import { rememberHostTitle, restoreHostTitle, setStepTitle } from '../a11y/title';
import type { FieldError } from '../api/client';
import { Banner } from '../components/Banner';
import { t } from '../i18n/t';
import { CheckAnswers } from '../screens/CheckAnswers';
import { DoneScreen } from '../screens/DoneScreen';
import type { ErrorItem } from '../screens/ErrorSummary';
import { isInputStep, QuestionScreen, type InputMethod } from '../screens/QuestionScreen';
import type { VoiceClipOutcome } from '../voice/types';
import type { Audience, OptionContext, ReferralPartner } from './options';
import { computePath, computeProgress, type ProgressState } from './progress';
import { createInitialState, engineReducer } from './reducer';
import type { EngineAction, EngineState, Flow, Step } from './types';
import { validateStep } from './validate';

const flows: Record<string, Flow> = {
  signup: signup as Flow,
  'job-application': jobApplication as Flow,
  'employer-job': employerJob as Flow,
};

export function getFlow(flowId: string): Flow | undefined {
  return flows[flowId];
}

export type Engine = [EngineState, Dispatch<EngineAction>];

/** The engine state for a flow, for a parent that saves or restores answers itself. */
export function useFlowEngine(flowId: string): Engine {
  const flow = flows[flowId] ?? flows.signup;
  return useReducer(engineReducer, flow, createInitialState);
}

export type SubmitOutcome = { ok: true } | { ok: false; code: string; fields?: FieldError[] };

/** What the host of the flow does with it (save, submit…). All optional: without them the
 * flow runs on its own in memory, which is what the unit tests use. */
export interface FlowHooks {
  /** The person left a step with Continue or Skip (after it passed validation). */
  onLeaveStep?: (step: Step, value: unknown, inputMethod: InputMethod, state: EngineState) => void;
  /** A new step is on screen. */
  onStepChange?: (step: Step, progress: ProgressState, state: EngineState) => void;
  /** Send from Check your answers. On ok the flow moves on to Done. */
  onSubmit?: (state: EngineState, path: Step[]) => Promise<SubmitOutcome>;
  /** A recorded voice clip: return the text for the field (and the speech service that made
   * it), an error code, or null if it couldn't be done. */
  onVoiceClip?: (clipId: string, step: Step) => Promise<string | VoiceClipOutcome | null>;
  onSpeechConsent?: (granted: boolean) => void;
}

export interface FlowRunnerProps {
  flowId: string;
  lang: string;
  engine?: Engine;
  hooks?: FlowHooks;
  audience?: Audience;
  referralPartners?: ReferralPartner[];
  /** manage-title: the page title follows the step (default true). */
  manageTitle?: boolean;
  /** Offer "Answer by voice" on text-like questions (default true). */
  voice?: boolean;
  /** Language-file key of the Check your answers button. */
  submitLabelKey?: string;
  renderStepExtra?: (step: Step, state: EngineState) => ReactNode;
  renderDone?: (step: Step, state: EngineState) => ReactNode;
  /** A choice question whose options didn't load (or there are none): what to show instead. */
  renderNoOptions?: (step: Step) => ReactNode;
  jobPostingJsonLd?: object | null;
  referralOrg?: string | null;
}

const DEFAULT_SUBMIT_KEYS: Record<string, string> = {
  signup: 'signup.check.submit',
  'job-application': 'application.check.submit',
  'employer-job': 'employer.check.submit',
};

function emptyValueFor(step: Step): unknown {
  if (step.type === 'multi_choice') return [];
  if (step.type === 'date' || step.type === 'consent') return null;
  return '';
}

export function FlowRunner(props: FlowRunnerProps) {
  const flow = flows[props.flowId];
  if (!flow) return <p>{t(props.lang, 'errors.unknown_flow')}</p>;
  return <FlowRunnerInner {...props} flow={flow} />;
}

function FlowRunnerInner({
  flow,
  lang,
  engine,
  hooks,
  audience,
  referralPartners,
  manageTitle = true,
  voice = true,
  submitLabelKey,
  renderStepExtra,
  renderDone,
  renderNoOptions,
  jobPostingJsonLd,
  referralOrg,
}: FlowRunnerProps & { flow: Flow }) {
  const own = useReducer(engineReducer, flow, createInitialState);
  const [state, dispatch] = engine ?? own;

  const headingRef = useRef<HTMLHeadingElement>(null);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<FieldError[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = state.flow.steps.find((s) => s.id === state.currentId);
  const path = useMemo(() => computePath(state.flow, state.answers), [state.flow, state.answers]);
  const progress = computeProgress(state.flow, state.currentId, state.answers);
  const optionContext = useMemo<OptionContext>(
    () => ({
      audience: audience ?? (flow.id === 'employer-job' ? 'employer' : 'learner'),
      referralPartners,
    }),
    [audience, flow.id, referralPartners],
  );
  const progressText = t(lang, 'common.progress', { n: progress.n, total: progress.total });

  // Keep the latest hooks and state for callbacks that finish later (voice clips, submit).
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const stateRef = useRef(state);
  stateRef.current = state;

  // R1: remember the host page's title, give it back when the flow goes away.
  useEffect(() => {
    rememberHostTitle(manageTitle);
    return () => restoreHostTitle();
  }, [manageTitle]);

  // A new step: focus its heading and update the title (only when the person moved here
  // themselves: never take focus from the host page on first load, W3).
  useEffect(() => {
    if (!step) return;
    const navigated = !!state.userNavigated;
    const title = t(lang, step.title);
    focusHeading(headingRef.current, navigated);
    if (navigated) {
      if (step.type === 'done') {
        restoreHostTitle();
      } else if (isInputStep(step)) {
        setStepTitle(`${progressText}: ${title}`);
        announce(progressText);
      } else {
        setStepTitle(title);
      }
    }
    setSubmitErrors([]);
    setSubmitError(null);
    hooksRef.current?.onStepChange?.(step, progress, stateRef.current);
    // Only when the step changes, not on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentId]);

  // Read aloud mode: a problem sending is read as soon as it shows.
  const [submitAttempt, setSubmitAttempt] = useState(0);
  useAutoRead(
    submitError ? `submit-error:${submitAttempt}` : null,
    () => [t(lang, `errors.${submitError}`)],
    lang,
  );

  if (!step) return <p>{t(lang, 'errors.unknown_question')}</p>;

  const answer = state.answers[step.id];

  const handleChange = (value: unknown, inputMethod: InputMethod) => {
    dispatch({ type: 'ANSWER', stepId: step.id, value, inputMethod });
  };

  const handleContinue = () => {
    const value = answer?.value;
    if (validateStep(step, value)) {
      dispatch({ type: 'CONTINUE' }); // the reducer records the error code
      setErrorAttempt((n) => n + 1);
      return;
    }
    hooks?.onLeaveStep?.(step, value, answer?.inputMethod ?? 'typed', state);
    dispatch({ type: 'CONTINUE' });
  };

  const handleSkip = () => {
    const empty = emptyValueFor(step);
    dispatch({ type: 'ANSWER', stepId: step.id, value: empty, inputMethod: 'typed' });
    hooks?.onLeaveStep?.(step, empty, 'typed', state);
    dispatch({ type: 'CONTINUE' });
  };

  const handleSubmit = async () => {
    if (!hooks?.onSubmit) {
      dispatch({ type: 'CONTINUE' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitErrors([]);
    let outcome: SubmitOutcome;
    try {
      outcome = await hooks.onSubmit(state, path);
    } catch {
      outcome = { ok: false, code: 'internal_error' };
    }
    setSubmitting(false);
    if (outcome.ok) {
      dispatch({ type: 'CONTINUE' });
      return;
    }
    const stepFields = (outcome.fields ?? []).filter((f) =>
      state.flow.steps.some((s) => s.id === f.field),
    );
    if (stepFields.length > 0) {
      setSubmitErrors(stepFields);
      setErrorAttempt((n) => n + 1);
    } else {
      setSubmitError(outcome.code);
      setSubmitAttempt((n) => n + 1);
      announce(t(lang, `errors.${outcome.code}`));
    }
  };

  // A recorded clip became text: put it in the field (a single choice is matched to an option
  // by the voice input itself). The voice input says and shows what was heard.
  const handleVoiceClip = async (clipId: string): Promise<VoiceClipOutcome | null> => {
    const onVoiceClip = hooksRef.current?.onVoiceClip;
    if (!onVoiceClip) {
      announce(t(lang, 'errors.speech_unavailable'));
      return { code: 'speech_unavailable' };
    }
    const res = await onVoiceClip(clipId, step);
    if (res === null) return null;
    const outcome: VoiceClipOutcome = typeof res === 'string' ? { text: res, raw: res } : res;
    if ('code' in outcome) return outcome;
    if (step.type !== 'single_choice' && stateRef.current.currentId === step.id) {
      dispatch({ type: 'ANSWER', stepId: step.id, value: outcome.text, inputMethod: 'voice' });
    }
    return outcome;
  };

  const showBack = state.history.length > 0 && step.type !== 'done';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      {(showBack || isInputStep(step)) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--bo-space-3)',
          }}
        >
          {showBack ? (
            <button type="button" className="bo-link" onClick={() => dispatch({ type: 'BACK' })}>
              <span aria-hidden="true">← </span>
              {t(lang, 'common.back')}
            </button>
          ) : (
            <span />
          )}
          {isInputStep(step) && (
            <p className="bo-hint" style={{ margin: 0 }}>
              {progressText}
            </p>
          )}
        </div>
      )}

      {step.type === 'check_answers' ? (
        <>
          {submitError && <Banner variant="error">{t(lang, `errors.${submitError}`)}</Banner>}
          <CheckAnswers
            step={step}
            flow={state.flow}
            answers={state.answers}
            lang={lang}
            path={path}
            headingRef={headingRef}
            optionContext={optionContext}
            isSubmitting={submitting}
            submitLabel={t(
              lang,
              submitLabelKey ?? DEFAULT_SUBMIT_KEYS[flow.id] ?? 'common.continue',
            )}
            errors={submitErrors.map((f): ErrorItem => {
              const target = state.flow.steps.find((s) => s.id === f.field);
              return {
                fieldId: `check-${f.field}`,
                message: `${target ? t(lang, target.title) : f.field}: ${t(lang, `errors.${f.code}`)}`,
                onSelect: () => dispatch({ type: 'GOTO', stepId: f.field }),
              };
            })}
            errorFocusKey={errorAttempt}
            onGoto={(id) => dispatch({ type: 'GOTO', stepId: id })}
            onSubmit={() => void handleSubmit()}
          />
        </>
      ) : step.type === 'done' ? (
        <DoneScreen
          step={step}
          flow={state.flow}
          lang={lang}
          headingRef={headingRef}
          jobPostingJsonLd={jobPostingJsonLd}
          referralOrg={referralOrg}
        >
          {renderDone?.(step, state)}
        </DoneScreen>
      ) : (
        <QuestionScreen
          key={step.id}
          step={step}
          lang={lang}
          value={answer?.value}
          error={state.errors[step.id]}
          errorFocusKey={errorAttempt}
          headingRef={headingRef}
          optionContext={optionContext}
          onChange={handleChange}
          onContinue={handleContinue}
          onSkip={handleSkip}
          voice={
            voice
              ? {
                  onPending: (clipId) => handleVoiceClip(clipId),
                  onSpeechConsent: hooks?.onSpeechConsent,
                }
              : null
          }
          extra={renderStepExtra?.(step, state)}
          progressText={isInputStep(step) ? progressText : undefined}
          noOptions={renderNoOptions?.(step)}
        />
      )}
    </div>
  );
}
