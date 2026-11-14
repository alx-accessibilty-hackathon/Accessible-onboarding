import type { RefObject } from 'react';
import type { Step } from '../engine/types';
import { t } from '../i18n/t';

export interface FieldProps<T = string> {
  step: Step;
  lang: string;
  value: T;
  onChange: (value: T) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function TextField({ step, lang, value, onChange, error, headingRef }: FieldProps<string>) {
  const inputId = `q-${step.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [step.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  const titleText = t(lang, step.title);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        <label htmlFor={inputId} style={{ cursor: 'pointer', display: 'block' }}>
          {titleText}
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
        value={value ?? ''}
        autoComplete={step.autocomplete || 'off'}
        aria-describedby={describedBy || undefined}
        aria-invalid={!!error}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          minHeight: 'var(--bo-target)',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          padding: '0.5em 0.75em',
          borderRadius: 'var(--bo-radius)',
          border: error ? '2px solid var(--bo-error)' : '2px solid var(--bo-border-strong)',
          backgroundColor: 'var(--bo-bg)',
          color: 'var(--bo-text)',
        }}
      />
    </div>
  );
}
