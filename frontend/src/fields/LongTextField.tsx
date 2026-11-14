import type { RefObject } from 'react';
import type { Step } from '../engine/types';
import { t } from '../i18n/t';

export interface LongTextFieldProps {
  step: Step;
  lang: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function LongTextField({
  step,
  lang,
  value,
  onChange,
  error,
  headingRef,
}: LongTextFieldProps) {
  const inputId = `q-${step.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [step.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  const maxRule = step.validate?.find((r) => r.rule === 'max_length');
  const maxLength = maxRule?.value ? Number(maxRule.value) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        <label htmlFor={inputId} style={{ cursor: 'pointer', display: 'block' }}>
          {t(lang, step.title)}
        </label>
      </h1>

      {step.hint && (
        <p id={hintId} className="bo-hint" style={{ margin: 0 }}>
          {t(lang, step.hint)}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          style={{
            margin: 0,
            color: 'var(--bo-error)',
            fontWeight: 600,
            fontSize: '0.95em',
          }}
        >
          <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
          {t(lang, `errors.${error}`)}
        </p>
      )}

      <textarea
        id={inputId}
        name={step.id}
        rows={4}
        maxLength={maxLength}
        value={value ?? ''}
        aria-describedby={describedBy || undefined}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          minHeight: '120px',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          padding: '0.5em 0.75em',
          borderRadius: 'var(--bo-radius)',
          border: error ? '2px solid var(--bo-error)' : '2px solid var(--bo-border-strong)',
          backgroundColor: 'var(--bo-bg)',
          color: 'var(--bo-text)',
          resize: 'vertical',
        }}
      />
    </div>
  );
}
