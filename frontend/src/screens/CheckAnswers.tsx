import { Button } from '../components/Button';
import { VisuallyHidden } from '../components/VisuallyHidden';
import type { AnswerState, Flow, Step } from '../engine/types';
import { t } from '../i18n/t';
import { formatEthiopianPhoneDisplay } from '../lib/phone';

export interface CheckAnswersProps {
  step?: Step;
  flow: Flow;
  answers: Record<string, AnswerState>;
  lang: string;
  onGoto: (stepId: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
}

export function formatAnswerValue(
  step: Step,
  val: unknown,
  lang: string,
): string {
  if (val === undefined || val === null || val === '') {
    return '—';
  }

  if (typeof val === 'boolean') {
    return val ? t(lang, 'common.yes') : t(lang, 'common.no');
  }

  if (Array.isArray(val)) {
    if (val.length === 0) return '—';
    return val
      .map((item) => {
        // Look up option label if available
        const opt = step.options?.find((o) => o.value === item);
        return opt ? t(lang, opt.label) : String(item);
      })
      .join(', ');
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

  if (step.type === 'single_choice' && step.options) {
    const opt = step.options.find((o) => o.value === String(val));
    return opt ? t(lang, opt.label) : String(val);
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
}: CheckAnswersProps) {
  const checkStep = step || flow.steps.find((s) => s.type === 'check_answers');
  const titleKey = checkStep?.title || `${flow.id}.check.title`;
  // Filter steps that were answered or belong to input path
  const answeredSteps = flow.steps.filter((step) => {
    if (
      step.type === 'info' ||
      step.type === 'consent' ||
      step.type === 'check_answers' ||
      step.type === 'done'
    ) {
      return false;
    }
    return true;
  });

  const hasPendingVoice = Object.values(answers).some((a) => !!a.pendingClipId);

  return (
    <section aria-labelledby="check-answers-heading" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <h1 id="check-answers-heading" tabIndex={-1} style={{ margin: 0 }}>
        {t(lang, titleKey)}
      </h1>

      {hasPendingVoice && (
        <div
          role="alert"
          style={{
            padding: 'var(--bo-space-3)',
            backgroundColor: 'var(--bo-info-bg)',
            border: '2px solid var(--bo-focus)',
            borderRadius: 'var(--bo-radius)',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            {lang === 'am'
              ? 'የድምፅ ምላሽዎ በሂደት ላይ ነው። እባክዎ ከማጠናቀቅዎ በፊት ያረጋግጡ።'
              : 'You have pending voice answers waiting for confirmation. Please review them before submitting.'}
          </p>
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
        {answeredSteps.map((step) => {
          const ans = answers[step.id];
          const rawValue = ans ? ans.value : undefined;
          const isPending = !!ans?.pendingClipId;
          const displayVal = isPending
            ? lang === 'am'
              ? 'የድምፅ መልስ ይጠበቃል...'
              : 'Voice answer waiting confirmation...'
            : formatAnswerValue(step, rawValue, lang);

          const stepTitle = t(lang, step.title);

          return (
            <div
              key={step.id}
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
                  fontStyle: isPending ? 'italic' : 'normal',
                }}
              >
                {displayVal}
              </dd>
              <dd style={{ margin: 0 }}>
                <button
                  type="button"
                  className="bo-link"
                  onClick={() => onGoto(step.id)}
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
        >
          {isSubmitting
            ? lang === 'am'
              ? 'በመላክ ላይ...'
              : 'Submitting...'
            : t(lang, 'common.continue')}
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
