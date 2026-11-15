import { useState, type ReactNode, type RefObject } from 'react';
import { useAutoRead } from '../a11y/modes';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { Button } from '../components/Button';
import type { Flow, Step } from '../engine/types';
import { ListenButton } from '../i18n/ReadAloud';
import { t } from '../i18n/t';

export interface DoneScreenProps {
  step: Step;
  flow: Flow;
  lang: string;
  headingRef?: RefObject<HTMLHeadingElement>;
  jobPostingJsonLd?: object | null;
  referralOrg?: string | null;
  /** What happens next, links and buttons that belong to this flow. */
  children?: ReactNode;
}

// Focus is moved to the heading by FlowRunner, and only when the person got here themselves.
export function DoneScreen({
  step,
  flow,
  lang,
  headingRef,
  jobPostingJsonLd,
  referralOrg,
  children,
}: DoneScreenProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!jobPostingJsonLd) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(jobPostingJsonLd, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code stays selectable in the box below.
    }
  };

  const titleKey = step.title || `${flow.id}.done.title`;

  const readParts = (): Part[] => [
    keyPart(lang, titleKey),
    step.hint && keyPart(lang, step.hint),
    referralOrg && keyPart(lang, 'done.referral_title'),
    referralOrg && t(lang, 'done.referral_body', { org: referralOrg }),
    flow.id === 'signup' && keyPart(lang, 'jobs.title'),
    flow.id === 'signup' && keyPart(lang, 'profile.open'),
    flow.id === 'employer-job' && keyPart(lang, 'staff.back_to_jobs'),
    jobPostingJsonLd && keyPart(lang, 'done.copy_jsonld'),
  ];
  useAutoRead(`done:${titleKey}:${referralOrg ?? ''}`, readParts, lang);

  return (
    <section
      aria-labelledby="done-heading"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--bo-space-3)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            width: '1.75em',
            height: '1.75em',
            borderRadius: '50%',
            backgroundColor: 'var(--bo-success)',
            color: 'var(--bo-on-primary)',
            fontSize: '1.5em',
            fontWeight: 'bold',
          }}
        >
          ✓
        </span>
        <h1 id="done-heading" tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
          {t(lang, titleKey)}
        </h1>
      </div>

      {step.hint && (
        <p className="bo-hint" style={{ fontSize: '1.1em', margin: 0 }}>
          {t(lang, step.hint)}
        </p>
      )}

      <div>
        <ListenButton lang={lang} parts={readParts} />
      </div>

      {referralOrg && (
        <div
          style={{
            padding: 'var(--bo-space-4)',
            backgroundColor: 'var(--bo-surface)',
            border: '2px solid var(--bo-border-strong)',
            borderRadius: 'var(--bo-radius)',
          }}
        >
          <h2 style={{ margin: '0 0 var(--bo-space-2) 0', fontSize: '1.1em' }}>
            {t(lang, 'done.referral_title')}
          </h2>
          <p style={{ margin: 0, color: 'var(--bo-text)' }}>
            {t(lang, 'done.referral_body', { org: referralOrg })}
          </p>
        </div>
      )}

      {children}

      {/* Employer flow: the JobPosting JSON-LD search engines read */}
      {jobPostingJsonLd && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--bo-space-2)',
            marginTop: 'var(--bo-space-3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--bo-space-2)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1em' }}>JobPosting JSON-LD</h2>
            <Button variant="secondary" onClick={handleCopy}>
              {copied ? t(lang, 'done.copied') : t(lang, 'done.copy_jsonld')}
            </Button>
          </div>
          <pre
            role="region"
            aria-label="JobPosting JSON-LD"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable code region must be keyboard-focusable per WCAG 2.1.1
            tabIndex={0}
            style={{
              padding: 'var(--bo-space-3)',
              backgroundColor: 'var(--bo-surface)',
              color: 'var(--bo-text)',
              border: '1px solid var(--bo-border-strong)',
              borderRadius: 'var(--bo-radius)',
              overflowX: 'auto',
              maxHeight: '300px',
              fontSize: '0.85em',
              fontFamily: 'monospace',
              margin: 0,
            }}
          >
            {JSON.stringify(jobPostingJsonLd, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
