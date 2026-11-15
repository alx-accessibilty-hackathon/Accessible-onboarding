import type { RefObject } from 'react';
import type { Part } from '../a11y/speaker';
import { Button } from '../components/Button';
import { ListenButton } from '../i18n/ReadAloud';
import { t } from '../i18n/t';
import { jobLocation, jobType, supportLabels } from './jobText';
import type { Job } from './match';

export interface JobDetailProps {
  job: Job;
  lang: string;
  onBack: () => void;
  onApply: (jobId: string) => void;
  headingRef?: RefObject<HTMLHeadingElement>;
}

/** The job, read aloud as it is shown (job posting text is fixed text, not personal). */
export function jobDetailParts(job: Job, lang: string): Part[] {
  const supports = supportLabels(job, lang);
  return [
    job.title,
    t(lang, 'jobs.employer'),
    job.employer?.name,
    t(lang, 'jobs.location'),
    jobLocation(job, lang),
    job.work_hours && t(lang, 'jobs.work_hours'),
    job.work_hours,
    t(lang, 'jobs.employment_type'),
    jobType(job, lang),
    t(lang, 'jobs.description'),
    job.description || job.summary,
    supports.length > 0 && t(lang, 'jobs.accommodations_offered'),
    ...supports,
  ];
}

const fact = { fontSize: '0.85em', color: 'var(--bo-text-muted)', display: 'block' } as const;

export function JobDetail({ job, lang, onBack, onApply, headingRef }: JobDetailProps) {
  const accommodationLabels = supportLabels(job, lang);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <div>
        <button
          type="button"
          className="bo-link"
          onClick={onBack}
          style={{
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--bo-space-1)',
          }}
        >
          <span aria-hidden="true">←</span> {t(lang, 'jobs.back_to_jobs')}
        </button>
      </div>

      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0 }}>
        {job.title}
      </h1>

      <div>
        <ListenButton lang={lang} parts={() => jobDetailParts(job, lang)} />
      </div>

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
          <span style={fact}>{t(lang, 'jobs.employer')}</span>
          <strong>{job.employer.name}</strong>
        </div>

        <div>
          <span style={fact}>{t(lang, 'jobs.location')}</span>
          <strong>{jobLocation(job, lang)}</strong>
        </div>

        {job.work_hours && (
          <div>
            <span style={fact}>{t(lang, 'jobs.work_hours')}</span>
            <strong>{job.work_hours}</strong>
          </div>
        )}

        <div>
          <span style={fact}>{t(lang, 'jobs.employment_type')}</span>
          <strong>{jobType(job, lang)}</strong>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '1.2em', margin: '0 0 var(--bo-space-2) 0' }}>
          {t(lang, 'jobs.description')}
        </h2>
        <div style={{ lineHeight: 1.6, color: 'var(--bo-text)', whiteSpace: 'pre-line' }}>
          {job.description || job.summary}
        </div>
      </div>

      {accommodationLabels.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.2em', margin: '0 0 var(--bo-space-2) 0' }}>
            {t(lang, 'jobs.accommodations_offered')}
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
            {accommodationLabels.map((lbl, idx) => (
              <li key={idx} style={{ color: 'var(--bo-text)' }}>
                {lbl}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 'var(--bo-space-3)' }}>
        <Button variant="primary" onClick={() => onApply(job.id)}>
          {t(lang, 'jobs.apply_for', { title: job.title })}
        </Button>
      </div>
    </div>
  );
}
