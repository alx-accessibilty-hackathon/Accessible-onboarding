import { useState } from 'react';
import { t } from '../i18n/t';
import { shrinkImage, type FileValue } from '../lib/image';
import type { FieldProps } from './TextField';

export function FileField({
  step,
  lang,
  value,
  onChange,
  error,
  headingRef,
}: FieldProps<FileValue | null>) {
  const inputId = `q-${step.id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [pickError, setPickError] = useState<string | null>(null);
  const problem = error ?? pickError;

  const describedBy = [step.hint ? hintId : null, problem ? errorId : null]
    .filter(Boolean)
    .join(' ');

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      onChange(await shrinkImage(file));
      setPickError(null);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'file_invalid');
    }
  };

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

      {problem && (
        <p
          id={errorId}
          role="alert"
          style={{ margin: 0, color: 'var(--bo-error)', fontWeight: 600 }}
        >
          <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
          {t(lang, `errors.${problem}`)}
        </p>
      )}

      <input
        id={inputId}
        name={step.id}
        type="file"
        accept="image/*"
        aria-describedby={describedBy || undefined}
        aria-invalid={!!problem}
        onChange={(e) => void pick(e.target.files?.[0])}
        style={{ width: '100%', minHeight: 'var(--bo-target)', fontSize: 'inherit' }}
      />

      {value && (
        <p data-bo-private="" style={{ margin: 0, overflowWrap: 'anywhere' }}>
          {t(lang, 'signup.id_upload.selected', { name: value.name })}
        </p>
      )}
    </div>
  );
}
