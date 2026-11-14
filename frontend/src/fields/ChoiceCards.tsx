import type { RefObject } from 'react';
import type { Option, Step } from '../engine/types';
import { t } from '../i18n/t';

export interface ChoiceCardsProps {
  step: Step;
  lang: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  headingRef?: RefObject<HTMLHeadingElement>;
  configReferrals?: Array<{ id: string; name: string }>;
}

export function ChoiceCards({
  step,
  lang,
  value,
  onChange,
  error,
  headingRef,
  configReferrals = [{ id: 'aaapd', name: 'AAAPD' }],
}: ChoiceCardsProps) {
  const fieldsetId = `q-${step.id}`;
  const hintId = `${fieldsetId}-hint`;
  const errorId = `${fieldsetId}-error`;

  const describedBy = [
    step.hint ? hintId : null,
    error ? errorId : null,
  ]
    .filter(Boolean)
    .join(' ');

  let options: Option[] = step.options || [];

  if (step.options_from === 'config:referral_partners') {
    options = configReferrals.map((p) => ({
      value: p.id,
      label: p.name,
      icon: 'handshake',
    }));
  }

  return (
    <fieldset
      id={fieldsetId}
      aria-describedby={describedBy || undefined}
      style={{
        border: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-3)',
      }}
    >
      <legend style={{ padding: 0, margin: 0, width: '100%' }}>
        <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
          {t(lang, step.title)}
        </h1>
      </legend>

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
          role="alert"
        >
          <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
          {t(lang, `errors.${error}`)}
        </p>
      )}

      <div
        role="radiogroup"
        aria-invalid={!!error}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--bo-space-3)',
          marginTop: 'var(--bo-space-2)',
        }}
      >
        {options.map((opt) => {
          const isSelected = String(value) === opt.value;
          const labelText =
            step.options_from === 'config:referral_partners'
              ? opt.label
              : t(lang, opt.label);

          return (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--bo-space-3)',
                minHeight: 'var(--bo-target)',
                padding: 'var(--bo-space-3) var(--bo-space-4)',
                borderRadius: 'var(--bo-radius)',
                cursor: 'pointer',
                border: isSelected
                  ? '3px solid var(--bo-primary)'
                  : '2px solid var(--bo-border-strong)',
                backgroundColor: isSelected
                  ? 'var(--bo-selected-bg)'
                  : 'var(--bo-bg)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <input
                type="radio"
                name={step.id}
                value={opt.value}
                checked={isSelected}
                onChange={() => onChange(opt.value)}
                style={{
                  width: '22px',
                  height: '22px',
                  accentColor: 'var(--bo-primary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '1em',
                  fontWeight: isSelected ? 700 : 500,
                  color: 'var(--bo-text)',
                  flexGrow: 1,
                }}
              >
                {labelText}
              </span>

              {/* Check icon for non-color-only indication */}
              {isSelected && (
                <span
                  aria-hidden="true"
                  style={{
                    color: 'var(--bo-primary)',
                    fontWeight: 'bold',
                    fontSize: '1.2em',
                  }}
                >
                  ✓
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
