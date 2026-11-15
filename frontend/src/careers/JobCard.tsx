import { Button } from '../components/Button';
import { t } from '../i18n/t';
import { jobLocation, jobSummary, matchText as matchTextOf, supportLabels } from './jobText';
import type { MatchedJob } from './match';

export interface JobCardProps {
  matched: MatchedJob;
  lang: string;
  onApply: (jobId: string) => void;
  onViewDetails: (jobId: string) => void;
}

export function JobCard({ matched, lang, onApply, onViewDetails }: JobCardProps) {
  const { job, totalSelected, isFullMatch } = matched;

  const accommodationLabels = supportLabels(job, lang);
  const location = jobLocation(job, lang);
  const matchText = matchTextOf(matched, lang);
  const supportsLabel = t(lang, 'jobs.supports_offered');
  // Read aloud mode: said when focus moves into this card (title, employer, place, type of
  // work, how many of the chosen supports it offers, the supports).
  const summary = jobSummary(matched, lang).join('. ');

  return (
    <article
      data-bo-context={summary}
      style={{
        padding: 'var(--bo-space-4)',
        borderRadius: 'var(--bo-radius)',
        border:
          isFullMatch && totalSelected > 0
            ? '2px solid var(--bo-primary)'
            : '1px solid var(--bo-border-subtle)',
        backgroundColor: 'var(--bo-bg)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-3)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-2)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: '0 0 var(--bo-space-1) 0', fontSize: '1.25em' }}>{job.title}</h2>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--bo-text-muted)' }}>
            {job.employer?.name} • {location}
          </p>
        </div>

        {totalSelected > 0 && (
          <div
            style={{
              padding: '0.2em 0.6em',
              borderRadius: 'var(--bo-radius)',
              fontSize: '0.85em',
              fontWeight: 700,
              backgroundColor: isFullMatch ? 'var(--bo-selected-bg)' : 'var(--bo-info-bg)',
              color: isFullMatch ? 'var(--bo-primary-hover)' : 'var(--bo-text)',
              border: `1px solid ${isFullMatch ? 'var(--bo-primary)' : 'var(--bo-border-strong)'}`,
            }}
          >
            {matchText}
          </div>
        )}
      </div>

      {(job.summary || job.description) && (
        <p style={{ margin: 0, color: 'var(--bo-text)', fontSize: '0.95em', lineHeight: 1.5 }}>
          {job.summary ?? excerpt(job.description ?? '')}
        </p>
      )}

      {accommodationLabels.length > 0 && (
        <div>
          <span
            style={{
              fontSize: '0.85em',
              fontWeight: 600,
              color: 'var(--bo-text-muted)',
              display: 'block',
              marginBottom: 'var(--bo-space-1)',
            }}
          >
            {supportsLabel}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bo-space-2)' }}>
            {accommodationLabels.map((lbl, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.8em',
                  padding: '0.2em 0.5em',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bo-surface)',
                  border: '1px solid var(--bo-border-subtle)',
                  color: 'var(--bo-text)',
                }}
              >
                {lbl}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-3)',
          marginTop: 'var(--bo-space-2)',
          alignItems: 'center',
        }}
      >
        <Button variant="primary" onClick={() => onApply(job.id)}>
          {t(lang, 'jobs.apply_for', { title: job.title })}
        </Button>

        <Button
          variant="secondary"
          onClick={() => onViewDetails(job.id)}
          aria-label={t(lang, 'jobs.view_details_for', { title: job.title })}
        >
          {t(lang, 'jobs.view_details')}
        </Button>
      </div>
    </article>
  );
}

function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).replace(/\s+\S*$/, '')}…` : clean;
}
