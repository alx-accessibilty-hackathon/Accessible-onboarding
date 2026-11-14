import { useEffect, useRef } from 'react';
import { t } from '../i18n/t';

export interface ErrorItem {
  fieldId: string;
  message: string;
}

export interface ErrorSummaryProps {
  errors: ErrorItem[];
  lang: string;
}

export function ErrorSummary({ errors, lang }: ErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) {
      summaryRef.current?.focus();
    }
  }, [errors]);

  if (errors.length === 0) return null;

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
              }}
              onClick={(ev) => {
                ev.preventDefault();
                // Move focus inside ShadowRoot or standard document
                const root = ev.currentTarget.getRootNode() as ShadowRoot | Document;
                const el = root.getElementById(e.fieldId) as HTMLElement | null;
                el?.focus();
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
