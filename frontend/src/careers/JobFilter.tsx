import needsVocab from '@shared/vocab/needs.json';
import { useId } from 'react';
import { t } from '../i18n/t';

export interface JobFilterProps {
  lang: string;
  selectedNeeds: string[];
  onChange: (needs: string[]) => void;
}

export function JobFilter({ lang, selectedNeeds, onChange }: JobFilterProps) {
  const hintId = `${useId()}-hint`;

  const handleToggle = (code: string) => {
    if (selectedNeeds.includes(code)) {
      onChange(selectedNeeds.filter((c) => c !== code));
    } else {
      onChange([...selectedNeeds, code]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <fieldset
      aria-describedby={hintId}
      style={{
        border: '2px solid var(--bo-border-subtle)',
        borderRadius: 'var(--bo-radius)',
        padding: 'var(--bo-space-3) var(--bo-space-4)',
        margin: 0,
        minWidth: 0,
        backgroundColor: 'var(--bo-surface)',
      }}
    >
      <legend
        style={{
          fontWeight: 700,
          fontSize: '1.1em',
          padding: '0 var(--bo-space-2)',
          color: 'var(--bo-text)',
        }}
      >
        {t(lang, 'jobs.filter_title')}
      </legend>

      <p id={hintId} className="bo-hint" style={{ margin: '0 0 var(--bo-space-3) 0' }}>
        {t(lang, 'jobs.filter_hint')}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(13em, 100%), 1fr))',
          gap: 'var(--bo-space-2)',
        }}
      >
        {needsVocab.items.map((item) => {
          const isChecked = selectedNeeds.includes(item.code);
          const labelText = t(lang, item.learner);

          return (
            <label
              key={item.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--bo-space-2)',
                padding: 'var(--bo-space-2) var(--bo-space-3)',
                borderRadius: 'var(--bo-radius)',
                cursor: 'pointer',
                minHeight: 'var(--bo-target)',
                border: isChecked
                  ? '2px solid var(--bo-primary)'
                  : '1px solid var(--bo-border-strong)',
                backgroundColor: isChecked ? 'var(--bo-selected-bg)' : 'var(--bo-bg)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggle(item.code)}
                style={{
                  width: '1.1em',
                  height: '1.1em',
                  accentColor: 'var(--bo-primary)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '0.9em',
                  color: 'var(--bo-text)',
                  fontWeight: isChecked ? 600 : 400,
                  minWidth: 0,
                }}
              >
                {labelText}
              </span>
            </label>
          );
        })}
      </div>

      {selectedNeeds.length > 0 && (
        <div
          style={{ marginTop: 'var(--bo-space-3)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <button
            type="button"
            className="bo-link"
            onClick={handleClear}
            style={{ fontSize: '0.9em' }}
          >
            {t(lang, 'jobs.clear_filters')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
