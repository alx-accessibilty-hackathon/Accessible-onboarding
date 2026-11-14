import needsVocab from '@shared/vocab/needs.json';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../a11y/announce';
import { rememberHostTitle, restoreHostTitle, setStepTitle } from '../a11y/title';
import { errorCode, type ApiConfig } from '../api/client';
import { fetchAllJobs } from '../api/jobs';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { t } from '../i18n/t';
import { loadNeeds } from '../offline/snapshot';
import { JobCard } from './JobCard';
import { JobDetail } from './JobDetail';
import { JobFilter } from './JobFilter';
import { matchJobs, type Job } from './match';

export interface JobsPageProps {
  lang: string;
  api?: ApiConfig;
  manageTitle?: boolean;
  /** Apply was pressed (the application flow takes over). */
  onApply?: (job: Job) => void;
}

const KNOWN_NEEDS = new Set(needsVocab.items.map((i) => i.code));

// JB-1 and JB-2: published jobs, the "Support I need" filter (matching happens on this
// phone; the needs are never sent), job cards and the job detail.
export function JobsPage({ lang, api, manageTitle = true, onApply }: JobsPageProps) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNeeds, setSelectedNeeds] = useState<string[]>([]);
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const touchedRef = useRef(false);
  const navigatedRef = useRef(false);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  // Load every published job (following next_cursor).
  useEffect(() => {
    if (!api) return;
    let active = true;
    setLoadError(null);
    fetchAllJobs(api)
      .then((items) => {
        if (active) setJobs(items);
      })
      .catch((err) => {
        if (active) setLoadError(errorCode(err));
      });
    return () => {
      active = false;
    };
  }, [api, reloadKey]);

  // Pre-fill the filter with the needs this person ticked when signing up (kept on this phone).
  useEffect(() => {
    let active = true;
    loadNeeds()
      .then((needs) => {
        const known = needs.filter((n) => KNOWN_NEEDS.has(n) && n !== 'other');
        if (active && !touchedRef.current && known.length > 0) setSelectedNeeds(known);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    rememberHostTitle(manageTitle);
    return () => restoreHostTitle();
  }, [manageTitle]);

  const matched = useMemo(() => matchJobs(jobs ?? [], selectedNeeds), [jobs, selectedNeeds]);
  const activeNeeds = selectedNeeds.filter((n) => n !== 'other').length;
  const fullMatches = matched.filter((m) => m.isFullMatch).length;
  const countText =
    activeNeeds > 0
      ? t(lang, 'jobs.result_count', { count: fullMatches, needs: activeNeeds })
      : t(lang, 'jobs.result_count_all', { count: jobs?.length ?? 0 });

  // Announce the result count when the filter changes (not on first load).
  useEffect(() => {
    if (touchedRef.current && jobs) announce(countText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNeeds]);

  const openJob = jobs?.find((j) => j.id === openJobId) ?? null;

  // Focus the heading of the screen the person moved to; the title follows.
  useEffect(() => {
    if (!navigatedRef.current) return;
    if (openJob) {
      detailHeadingRef.current?.focus();
      setStepTitle(openJob.title);
    } else {
      listHeadingRef.current?.focus();
      setStepTitle(t(lang, 'jobs.title'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openJobId]);

  const handleFilter = useCallback((needs: string[]) => {
    touchedRef.current = true;
    setSelectedNeeds(needs);
  }, []);

  const handleApply = (jobId: string) => {
    const job = jobs?.find((j) => j.id === jobId);
    if (job) onApply?.(job);
  };

  if (openJob) {
    return (
      <JobDetail
        job={openJob}
        lang={lang}
        headingRef={detailHeadingRef}
        onBack={() => {
          navigatedRef.current = true;
          setOpenJobId(null);
        }}
        onApply={handleApply}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <h1 tabIndex={-1} ref={listHeadingRef}>
        {t(lang, 'jobs.title')}
      </h1>

      <JobFilter lang={lang} selectedNeeds={selectedNeeds} onChange={handleFilter} />

      {loadError && (
        <Banner variant="error">
          <p style={{ margin: '0 0 var(--bo-space-2) 0' }}>{t(lang, `errors.${loadError}`)}</p>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            {t(lang, 'common.try_again')}
          </Button>
        </Banner>
      )}

      {!jobs && !loadError && <p>{t(lang, 'common.loading')}</p>}

      {jobs && (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>{countText}</p>
          {jobs.length === 0 ? (
            <p>{t(lang, 'jobs.none')}</p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--bo-space-4)',
              }}
            >
              {matched.map((m) => (
                <li key={m.job.id}>
                  <JobCard
                    matched={m}
                    lang={lang}
                    onApply={handleApply}
                    onViewDetails={(id) => {
                      navigatedRef.current = true;
                      setOpenJobId(id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
