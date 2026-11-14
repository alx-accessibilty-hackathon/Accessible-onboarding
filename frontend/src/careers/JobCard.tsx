import needsVocab from '@shared/vocab/needs.json';
import { Button } from '../components/Button';
import { t } from '../i18n/t';
import type { MatchedJob } from './match';

export interface JobCardProps {
  matched: MatchedJob;
  lang: string;
  onApply: (jobId: string) => void;
  onViewDetails: (jobId: string) => void;
}

export function JobCard({ matched, lang, onApply, onViewDetails }: JobCardProps) {
  const { job, matchedCount, totalSelected, isFullMatch } = matched;

  // Lookup accommodation employer labels
  const accommodationLabels = (job.accommodations ?? [])
    .filter((c) => c !== 'other')
    .map((code) => {
      const item = needsVocab.items.find((n) => n.code === code);
      return item ? t(lang, item.employer) : code;
    });

  return (
    <article
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
        <div>
          <h2 style={{ margin: '0 0 var(--bo-space-1) 0', fontSize: '1.25em' }}>{job.title}</h2>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--bo-text-muted)' }}>
            {job.employer?.name} •{' '}
            {job.location_text || t(lang, `employer.location_type.${job.location_type}`)}
          </p>
        </div>

        {totalSelected > 0 && (
          <div
            style={{
              padding: '4px 10px',
              borderRadius: '16px',
              fontSize: '0.85em',
              fontWeight: 700,
              backgroundColor: isFullMatch ? 'var(--bo-selected-bg)' : 'var(--bo-info-bg)',
              color: isFullMatch ? 'var(--bo-primary)' : 'var(--bo-text)',
              border: `1px solid ${isFullMatch ? 'var(--bo-primary)' : 'var(--bo-border-strong)'}`,
            }}
          >
            {isFullMatch
              ? lang === 'am'
                ? `የመረጧቸውን ሁሉንም ${totalSelected} ድጋፎች ያሟላል`
                : `Offers all ${totalSelected} supports you chose`
              : lang === 'am'
                ? `ከመረጧቸው ውስጥ ${matchedCount} ከ ${totalSelected} ድጋፎችን ያሟላል`
                : `Offers ${matchedCount} of ${totalSelected} supports`}
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
              marginBottom: '4px',
            }}
          >
            {lang === 'am' ? 'የሚቀርቡ ድጋፎች፦' : 'Supports offered:'}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {accommodationLabels.map((lbl, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.8em',
                  padding: '3px 8px',
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
        <Button
          variant="primary"
          onClick={() => onApply(job.id)}
          aria-label={`${lang === 'am' ? 'ያመልክቱ ለ' : 'Apply for'} ${job.title}`}
        >
          {lang === 'am' ? `ያመልክቱ ለ ${job.title}` : `Apply for ${job.title}`}
        </Button>

        <Button
          variant="secondary"
          onClick={() => onViewDetails(job.id)}
          aria-label={`${lang === 'am' ? 'ዝርዝር ይመልከቱ ለ' : 'View details for'} ${job.title}`}
        >
          {lang === 'am' ? 'ዝርዝር ይመልከቱ' : 'View details'}
        </Button>
      </div>
    </article>
  );
}

function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).replace(/\s+\S*$/, '')}…` : clean;
}
