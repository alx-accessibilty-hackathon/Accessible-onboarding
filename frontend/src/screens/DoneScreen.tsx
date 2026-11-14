import { useEffect, useState, type RefObject } from 'react';
import { Button } from '../components/Button';
import type { Flow, Step } from '../engine/types';
import { t } from '../i18n/t';

export interface DoneScreenProps {
  step: Step;
  flow: Flow;
  lang: string;
  headingRef?: RefObject<HTMLHeadingElement>;
  jobPostingJsonLd?: object | null;
  referralOrg?: string | null;
}

export function DoneScreen({
  step,
  flow,
  lang,
  headingRef,
  jobPostingJsonLd,
  referralOrg,
}: DoneScreenProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Focus the heading on arrival
    headingRef?.current?.focus();
  }, [headingRef]);

  const handleCopy = async () => {
    if (!jobPostingJsonLd) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(jobPostingJsonLd, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const titleKey = step.title || `${flow.id}.done.title`;
  const hintKey = step.hint || `${flow.id}.done.hint`;

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
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'var(--bo-success)',
            color: '#fff',
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

      <p className="bo-hint" style={{ fontSize: '1.1em', margin: 0 }}>
        {t(lang, hintKey)}
      </p>

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
            {lang === 'am' ? 'የሪፈራል ሁኔታ' : 'Referral Status'}
          </h2>
          <p style={{ margin: 0, color: 'var(--bo-text)' }}>
            {lang === 'am'
              ? `${referralOrg} ድርጅት በቅርቡ ያነጋግርዎታል።`
              : `Your referral has been sent to ${referralOrg}. They will reach out to you shortly to assist with your onboarding.`}
          </p>
        </div>
      )}

      {/* If employer flow: show JobPosting JSON-LD */}
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
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '1.1em' }}>JobPosting JSON-LD</h2>
            <Button
              variant="secondary"
              onClick={handleCopy}
              style={{ minHeight: '40px', padding: '0.4em 0.8em' }}
            >
              {copied
                ? lang === 'am'
                  ? 'ተቀድቷል!'
                  : 'Copied!'
                : lang === 'am'
                  ? 'ኮድ ቅዳ'
                  : 'Copy JSON-LD'}
            </Button>
          </div>
          <pre
            role="region"
            aria-label="JobPosting JSON-LD"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable code region must be keyboard-focusable per WCAG 2.1.1
            tabIndex={0}
            style={{
              padding: 'var(--bo-space-3)',
              backgroundColor: '#1b1f24',
              color: '#f5f7fa',
              borderRadius: 'var(--bo-radius)',
              overflowX: 'auto',
              maxHeight: '300px',
              fontSize: '0.85em',
              fontFamily: 'monospace',
            }}
          >
            {JSON.stringify(jobPostingJsonLd, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
