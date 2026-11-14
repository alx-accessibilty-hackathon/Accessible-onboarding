import type { RefObject } from 'react';
import { Button } from '../components/Button';
import { VisuallyHidden } from '../components/VisuallyHidden';
import { resolveOptions, type OptionContext } from '../engine/options';
import type { AnswerState, Flow, Step } from '../engine/types';
import { t } from '../i18n/t';
import { formatEthiopianPhoneDisplay } from '../lib/phone';
import { ErrorSummary, type ErrorItem } from './ErrorSummary';

const NON_INPUT = new Set(['info', 'consent', 'check_answers', 'done']);

export interface CheckAnswersProps {
  step?: Step;
  flow: Flow;
  answers: Record<string, AnswerState>;
  lang: string;
  onGoto: (stepId: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
  /** The steps on the person's current path; only these are listed. */
  path?: Step[];
  /** Translated text of the submit button ("Send my answers"…). */
  submitLabel?: string;
  /** Problems found when sending (e.g. missing answers from the server). */
  errors?: ErrorItem[];
  errorFocusKey?: number;
  headingRef?: RefObject<HTMLHeadingElement>;
  optionContext?: OptionContext;
}

export function formatAnswerValue(
  step: Step,
  val: unknown,
  lang: string,
  ctx: OptionContext = {},
): string {
  if (val === undefined || val === null || val === '') {
    return '—';
  }

  if (typeof val === 'boolean') {
    return val ? t(lang, 'common.yes') : t(lang, 'common.no');
  }

  const options = resolveOptions(step, ctx);
  const labelOf = (item: unknown): string => {
    const opt = options.find((o) => o.value === String(item));
    if (!opt) return String(item);
    return opt.literal ? opt.label : t(lang, opt.label);
  };

  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    return val.map(labelOf).join(', ');
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('iso' in obj && typeof obj.iso === 'string') {
      if (obj.calendar === 'ethiopian' && obj.ethiopian) {
        const et = obj.ethiopian as { year: number; month: number; day: number };
        return `${et.day}/${et.month}/${et.year} (${obj.iso})`;
      }
      return obj.iso;
    }
    return JSON.stringify(val);
  }

  if (step.type === 'phone') {
    return formatEthiopianPhoneDisplay(String(val));
  }

  if (step.type === 'single_choice') {
    return labelOf(val);
  }

  return String(val);
}

export function CheckAnswers({
  step,
  flow,
  answers,
  lang,
  onGoto,
  onSubmit,
  onBack,
  isSubmitting = false,
  path,
  submitLabel,
  errors = [],
  errorFocusKey,
  headingRef,
  optionContext,
}: CheckAnswersProps) {
  const checkStep = step || flow.steps.find((s) => s.type === 'check_answers');
  const titleKey = checkStep?.title || `${flow.id}.check.title`;
  // Only the questions on the person's path (a skipped branch is not listed).
  const answeredSteps = (path ?? flow.steps).filter((s) => !NON_INPUT.has(s.type));

  const hasPendingVoice = answeredSteps.some((s) => !!answers[s.id]?.pendingClipId);

  return (
    <section
      aria-labelledby="check-answers-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}
    >
      <ErrorSummary errors={errors} lang={lang} focusKey={errorFocusKey} />

      <h1 id="check-answers-heading" tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        {t(lang, titleKey)}
      </h1>

      {hasPendingVoice && (
        <div
          style={{
            padding: 'var(--bo-space-3)',
            backgroundColor: 'var(--bo-info-bg)',
            border: '2px solid var(--bo-focus)',
            borderRadius: 'var(--bo-radius)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>{t(lang, 'check.voice_pending')}</p>
        </div>
      )}

      <dl
        style={{
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid var(--bo-border-subtle)',
        }}
      >
        {answeredSteps.map((s) => {
          const ans = answers[s.id];
          const rawValue = ans ? ans.value : undefined;
          const isPending = !!ans?.pendingClipId;
          const displayVal = isPending
            ? t(lang, 'check.voice_waiting')
            : formatAnswerValue(s, rawValue, lang, optionContext);

          const stepTitle = t(lang, s.title);

          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: 'var(--bo-space-3) 0',
                borderBottom: '1px solid var(--bo-border-subtle)',
                gap: 'var(--bo-space-2)',
              }}
            >
              <dt
                style={{
                  fontWeight: 700,
                  flexBasis: '40%',
                  color: 'var(--bo-text)',
                }}
              >
                {stepTitle}
              </dt>
              <dd
                style={{
                  margin: 0,
                  flexGrow: 1,
                  color: isPending ? 'var(--bo-primary)' : 'var(--bo-text-muted)',
                  overflowWrap: 'anywhere',
                }}
              >
                {displayVal}
              </dd>
              <dd style={{ margin: 0 }}>
                <button
                  type="button"
                  className="bo-link"
                  onClick={() => onGoto(s.id)}
                  style={{
                    fontWeight: 700,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  {t(lang, 'common.change')}
                  <VisuallyHidden> {stepTitle}</VisuallyHidden>
                </button>
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="bo-actions" style={{ marginTop: 'var(--bo-space-3)' }}>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={hasPendingVoice || isSubmitting}
          aria-busy={isSubmitting || undefined}
        >
          {isSubmitting ? t(lang, 'common.sending') : (submitLabel ?? t(lang, 'common.continue'))}
        </Button>

        {onBack && (
          <Button variant="secondary" onClick={onBack}>
            {t(lang, 'common.back')}
          </Button>
        )}
      </div>
    </section>
  );
}
