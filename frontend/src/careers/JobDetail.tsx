import needsVocab from '@shared/vocab/needs.json';
import type { RefObject } from 'react';
import { Button } from '../components/Button';
import { t } from '../i18n/t';
import type { Job } from './match';

export interface JobDetailProps {
  job: Job;
  lang: string;
  onBack: () => void;
  onApply: (jobId: string) => void;
  headingRef?: RefObject<HTMLHeadingElement>;
}

export function JobDetail({ job, lang, onBack, onApply, headingRef }: JobDetailProps) {
  const accommodationLabels = (job.accommodations ?? [])
    .filter((c) => c !== 'other')
    .map((code) => {
      const item = needsVocab.items.find((n) => n.code === code);
      return item ? t(lang, item.employer) : code;
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <div>
        <button
          type="button"
          className="bo-link"
          onClick={onBack}
          style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          ← {lang === 'am' ? 'ወደ ስራዎች ዝርዝር ተመለስ' : 'Back to jobs'}
        </button>
      </div>

      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        {job.title}
      </h1>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-3)',
          padding: 'var(--bo-space-3)',
          backgroundColor: 'var(--bo-surface)',
          borderRadius: 'var(--bo-radius)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.85em', color: 'var(--bo-text-muted)', display: 'block' }}>
            {lang === 'am' ? 'አሰሪ' : 'Employer'}
          </span>
          <strong>{job.employer.name}</strong>
        </div>

        <div>
          <span style={{ fontSize: '0.85em', color: 'var(--bo-text-muted)', display: 'block' }}>
            {lang === 'am' ? 'ቦታ' : 'Location'}
          </span>
          <strong>
            {job.location_text || t(lang, `employer.location_type.${job.location_type}`)}
          </strong>
        </div>

        {job.work_hours && (
          <div>
            <span style={{ fontSize: '0.85em', color: 'var(--bo-text-muted)', display: 'block' }}>
              {lang === 'am' ? 'የስራ ሰዓት' : 'Work hours'}
            </span>
            <strong>{job.work_hours}</strong>
          </div>
        )}

        <div>
          <span style={{ fontSize: '0.85em', color: 'var(--bo-text-muted)', display: 'block' }}>
            {lang === 'am' ? 'የቅጥር ሁኔታ' : 'Employment type'}
          </span>
          <strong>{t(lang, `employer.employment_type.${job.employment_type}`)}</strong>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '1.2em', margin: '0 0 var(--bo-space-2) 0' }}>
          {lang === 'am' ? 'የስራው ማብራሪያ' : 'Job Description'}
        </h2>
        <div style={{ lineHeight: 1.6, color: 'var(--bo-text)', whiteSpace: 'pre-line' }}>
          {job.description || job.summary}
        </div>
      </div>

      {accommodationLabels.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.2em', margin: '0 0 var(--bo-space-2) 0' }}>
            {lang === 'am' ? 'ይህ ስራ የሚያቀርባቸው ድጋፎች' : 'Accommodations Offered'}
          </h2>
          <ul
            style={{
              margin: 0,
              paddingInlineStart: 'var(--bo-space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {accommodationLabels.map((lbl, idx) => (
              <li key={idx} style={{ color: 'var(--bo-text)' }}>
                {lbl}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 'var(--bo-space-3)' }}>
        <Button
          variant="primary"
          onClick={() => onApply(job.id)}
          aria-label={`${lang === 'am' ? 'ያመልክቱ ለ' : 'Apply for'} ${job.title}`}
        >
          {lang === 'am' ? `ያመልክቱ ለ ${job.title}` : `Apply for ${job.title}`}
        </Button>
      </div>
    </div>
  );
}
