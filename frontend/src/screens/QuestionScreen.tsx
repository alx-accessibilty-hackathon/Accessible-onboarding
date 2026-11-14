import type { FormEvent, ReactNode, RefObject } from 'react';
import { Button } from '../components/Button';
import type { OptionContext } from '../engine/options';
import type { AnswerState, Step } from '../engine/types';
import { ChoiceCards } from '../fields/ChoiceCards';
import { DateField } from '../fields/DateField';
import { DigitsField } from '../fields/DigitsField';
import { LongTextField } from '../fields/LongTextField';
import { MultiChoiceCards } from '../fields/MultiChoiceCards';
import { PhoneField } from '../fields/PhoneField';
import { TextField } from '../fields/TextField';
import { ReadAloud } from '../i18n/ReadAloud';
import { t } from '../i18n/t';
import type { DateAnswerValue } from '../lib/ethiopianCalendar';
import { VoiceInput } from '../voice/VoiceInput';
import { ErrorSummary } from './ErrorSummary';

export type InputMethod = AnswerState['inputMethod'];

const VOICE_TYPES = new Set(['text', 'long_text', 'phone', 'digits']);
const INPUT_TYPES = new Set([
  'text',
  'long_text',
  'phone',
  'date',
  'digits',
  'single_choice',
  'multi_choice',
]);

export function isInputStep(step: Step): boolean {
  return INPUT_TYPES.has(step.type);
}

export interface VoiceHandlers {
  onPending: (clipId: string) => void;
  onSpeechConsent?: (granted: boolean) => void;
}

export interface QuestionScreenProps {
  step: Step;
  lang: string;
  value: unknown;
  error?: string;
  /** Changes on every failed Continue, so focus goes to the error summary each time. */
  errorFocusKey?: number;
  headingRef?: RefObject<HTMLHeadingElement>;
  optionContext?: OptionContext;
  onChange?: (value: unknown, inputMethod: InputMethod) => void;
  onContinue?: () => void;
  onSkip?: () => void;
  /** Voice answers for text-like questions; null turns voice off. */
  voice?: VoiceHandlers | null;
  /** Extra content under the question (e.g. the contact details to confirm). */
  extra?: ReactNode;
}

// One step = one screen (W4 markup). Questions with one input put the label inside the h1;
// choices put the h1 inside the legend. Info and consent screens have their own h1.
export function QuestionScreen({
  step,
  lang,
  value,
  error,
  errorFocusKey,
  headingRef,
  optionContext,
  onChange = () => {},
  onContinue,
  onSkip,
  voice,
  extra,
}: QuestionScreenProps) {
  const fieldId = `q-${step.id}`;
  const input = isInputStep(step);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onContinue?.();
  };

  const errors = error
    ? [{ fieldId, message: t(lang, `errors.${error}`) }]
    : [];

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}
    >
      <ErrorSummary errors={errors} lang={lang} focusKey={errorFocusKey} />

      {renderField()}

      {extra}

      <div>
        <ReadAloud
          stringKey={step.title}
          lang={lang}
          fallbackText={[t(lang, step.title), step.hint ? t(lang, step.hint) : '']
            .filter(Boolean)
            .join('. ')}
        />
      </div>

      {voice && VOICE_TYPES.has(step.type) && (
        <VoiceInput
          step={step}
          lang={lang}
          onConfirm={(v) => onChange(v, 'voice')}
          onPending={voice.onPending}
          onSpeechConsent={voice.onSpeechConsent}
        />
      )}

      <div className="bo-actions">
        <Button variant="primary" type="submit">
          {t(lang, 'common.continue')}
        </Button>
        {input && !step.required && onSkip && (
          <Button variant="secondary" onClick={onSkip}>
            {t(lang, 'common.skip')}
          </Button>
        )}
      </div>
    </form>
  );

  function renderField(): ReactNode {
    const common = { step, lang, error, headingRef };
    const asText = typeof value === 'string' ? value : '';

    switch (step.type) {
      case 'text':
        return <TextField {...common} value={asText} onChange={(v) => onChange(v, 'typed')} />;
      case 'long_text':
        return (
          <LongTextField {...common} value={asText} onChange={(v) => onChange(v, 'typed')} />
        );
      case 'phone':
        return <PhoneField {...common} value={asText} onChange={(v) => onChange(v, 'typed')} />;
      case 'digits':
        return <DigitsField {...common} value={asText} onChange={(v) => onChange(v, 'typed')} />;
      case 'date':
        return (
          <DateField
            {...common}
            value={(value as DateAnswerValue | null) ?? null}
            onChange={(v) => onChange(v, 'typed')}
          />
        );
      case 'single_choice':
        return (
          <ChoiceCards
            {...common}
            value={asText}
            referralPartners={optionContext?.referralPartners}
            onChange={(v) => onChange(v, 'choice')}
          />
        );
      case 'multi_choice':
        return (
          <MultiChoiceCards
            {...common}
            value={Array.isArray(value) ? (value as string[]) : []}
            isEmployer={optionContext?.audience === 'employer'}
            onChange={(v) => onChange(v, 'choice')}
          />
        );
      case 'consent':
        return <ConsentField {...common} value={value === true} onChange={onChange} />;
      default:
        // info (welcome) and anything without an input: heading and hint only
        return (
          <>
            <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
              {t(lang, step.title)}
            </h1>
            {step.hint && <p className="bo-hint">{t(lang, step.hint)}</p>}
          </>
        );
    }
  }
}

function ConsentField({
  step,
  lang,
  error,
  headingRef,
  value,
  onChange,
}: {
  step: Step;
  lang: string;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
  value: boolean;
  onChange: (value: unknown, inputMethod: InputMethod) => void;
}) {
  const inputId = `q-${step.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [step.hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        {t(lang, step.title)}
      </h1>
      {step.hint && (
        <p id={hintId} className="bo-hint">
          {t(lang, step.hint)}
        </p>
      )}
      {error && (
        <p id={errorId} style={{ margin: 0, color: 'var(--bo-error)', fontWeight: 600 }}>
          <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
          {t(lang, `errors.${error}`)}
        </p>
      )}
      <label
        className="bo-checkbox"
        style={{
          padding: 'var(--bo-space-3) var(--bo-space-4)',
          borderRadius: 'var(--bo-radius)',
          border: value ? '3px solid var(--bo-primary)' : '2px solid var(--bo-border-strong)',
          background: value ? 'var(--bo-selected-bg)' : 'var(--bo-bg)',
          fontWeight: 600,
        }}
      >
        <input
          id={inputId}
          type="checkbox"
          checked={value}
          aria-describedby={describedBy || undefined}
          aria-invalid={!!error}
          // Unticked = no answer (null), so "required" catches it.
          onChange={(e) => onChange(e.target.checked ? true : null, 'choice')}
        />
        <span>{t(lang, 'consent.agree')}</span>
        {value && (
          <span aria-hidden="true" style={{ color: 'var(--bo-primary)', marginInlineStart: 'auto' }}>
            ✓
          </span>
        )}
      </label>
    </>
  );
}
