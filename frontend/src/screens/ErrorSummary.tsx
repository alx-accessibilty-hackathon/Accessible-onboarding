import { useEffect, useRef } from 'react';
import { t } from '../i18n/t';

export interface ErrorItem {
  fieldId: string;
  message: string;
  /** Instead of focusing the field: e.g. go to the step from Check your answers. */
  onSelect?: () => void;
}

export interface ErrorSummaryProps {
  errors: ErrorItem[];
  lang: string;
  /** Change it (e.g. a counter of failed Continues) to move focus to the summary again. */
  focusKey?: number | string;
}

const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button';

// Focus the field itself; a fieldset (choices, date) can't take focus, so its first input does.
function focusField(root: ShadowRoot | Document, id: string): void {
  const el = root.getElementById(id) as HTMLElement | null;
  if (!el) return;
  const target = el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
  (target ?? el).focus();
}

export function ErrorSummary({ errors, lang, focusKey }: ErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const key = `${focusKey ?? ''}|${errors.map((e) => `${e.fieldId}:${e.message}`).join(',')}`;
  const hasErrors = errors.length > 0;

  // Only when the errors (or the attempt) change, so a re-render never pulls focus back here.
  useEffect(() => {
    if (hasErrors) summaryRef.current?.focus();
  }, [key, hasErrors]);

  if (!hasErrors) return null;

  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      aria-labelledby="es-title"
      style={{
        padding: 'var(--bo-space-4)',
        borderRadius: 'var(--bo-radius)',
        backgroundColor: 'var(--bo-error-bg)',
        border: '3px solid var(--bo-error)',
        marginBottom: 'var(--bo-space-3)',
      }}
    >
      <h2
        id="es-title"
        style={{
          margin: '0 0 var(--bo-space-2) 0',
          fontSize: '1.2em',
          color: 'var(--bo-error)',
        }}
      >
        {t(lang, 'common.error_summary_title')}
      </h2>
      <ul
        style={{
          margin: 0,
          paddingInlineStart: 'var(--bo-space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--bo-space-1)',
        }}
      >
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              style={{
                color: 'var(--bo-error)',
                fontWeight: 700,
                textDecoration: 'underline',
                display: 'inline-block',
                minHeight: 'var(--bo-target)',
                paddingBlock: 'var(--bo-space-2)',
              }}
              onClick={(ev) => {
                ev.preventDefault(); // don't change the host page address (W3)
                if (e.onSelect) {
                  e.onSelect();
                  return;
                }
                // Move focus inside the shadow root or the standard document
                const root = ev.currentTarget.getRootNode() as ShadowRoot | Document;
                focusField(root, e.fieldId);
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
