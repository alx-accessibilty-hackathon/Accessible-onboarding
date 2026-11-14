import type { RefObject } from 'react';
import type { Step } from '../engine/types';
import { t } from '../i18n/t';

export interface DigitsFieldProps {
  step: Step;
  lang: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function DigitsField({
  step,
  lang,
  value,
  onChange,
  error,
  headingRef,
}: DigitsFieldProps) {
  const inputId = `q-${step.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [
    step.hint ? hintId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  const digitRule = step.validate?.find((r) => r.rule === 'digits');
  const maxDigits = digitRule?.value ? Number(digitRule.value) : 4;

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

      <input
        id={inputId}
        name={step.id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={maxDigits}
        value={value ?? ''}
        aria-describedby={describedBy || undefined}
        aria-invalid={!!error}
        onChange={(e) => {
          // Keep only digits
          const clean = e.target.value.replace(/\D/g, '');
          onChange(clean);
        }}
        style={{
          width: '100%',
          maxWidth: '12em',
          minHeight: 'var(--bo-target)',
          fontSize: '1.2em',
          letterSpacing: '0.2em',
          fontFamily: 'monospace, sans-serif',
          padding: '0.5em 0.75em',
          borderRadius: 'var(--bo-radius)',
          border: error
            ? '2px solid var(--bo-error)'
            : '2px solid var(--bo-border-strong)',
          backgroundColor: 'var(--bo-bg)',
          color: 'var(--bo-text)',
        }}
      />
    </div>
  );
}
