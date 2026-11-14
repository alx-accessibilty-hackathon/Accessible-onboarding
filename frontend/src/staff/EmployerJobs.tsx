import { useEffect, useState } from 'react';
import type { StaffUser } from '../api/auth';
import { fetchEmployerJobs } from '../api/employer';
import type { Job } from '../careers/match';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FlowRunner } from '../engine/FlowRunner';
import { t } from '../i18n/t';

export interface EmployerJobsProps {
  user: StaffUser;
  token: string;
  apiOrigin?: string;
  lang?: string;
  onLogout: () => void;
}

export function EmployerJobs({
  user,
  token,
  apiOrigin = '',
  lang = 'en',
  onLogout,
}: EmployerJobsProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingJob, setIsCreatingJob] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      setLoading(true);
      const items = await fetchEmployerJobs({
        origin: apiOrigin,
        partnerKey: 'pk_employer',
        token,
      });
      if (active) {
        setJobs(items);
        setLoading(false);
      }
    }

    loadJobs();
    return () => {
      active = false;
    };
  }, [token, apiOrigin]);

  return (
    <div className="bo-employer-dashboard" style={{ width: '100%', maxWidth: '48em', margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-3)',
          marginBottom: 'var(--bo-space-5)',
          borderBottom: '1px solid var(--bo-border-subtle)',
          paddingBottom: 'var(--bo-space-4)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5em' }}>{t(lang, 'staff.jobs_title')}</h1>
          <p className="bo-hint" style={{ margin: 'var(--bo-space-1) 0 0 0' }}>
            Signed in as <strong>{user.name || user.email}</strong>
          </p>
        </div>

        <div className="bo-actions">
          {!isCreatingJob ? (
            <Button variant="primary" onClick={() => setIsCreatingJob(true)}>
              {t(lang, 'staff.create_job')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setIsCreatingJob(false)}>
              {t(lang, 'staff.back_to_jobs')}
            </Button>
          )}

          <Button variant="secondary" onClick={onLogout}>
            {t(lang, 'staff.signout_button')}
          </Button>
        </div>
      </header>

      {isCreatingJob ? (
        <Card style={{ padding: 'var(--bo-space-5)' }}>
          <FlowRunner flowId="employer-job" lang={lang} />
        </Card>
      ) : (
        <div>
          {loading && <p>{t(lang, 'common.listen')}...</p>}

          {!loading && jobs.length === 0 && (
            <Card style={{ textAlign: 'center', padding: 'var(--bo-space-6)' }}>
              <p style={{ margin: '0 0 var(--bo-space-4) 0', color: 'var(--bo-text-muted)' }}>
                {t(lang, 'staff.no_jobs')}
              </p>
              <Button variant="primary" onClick={() => setIsCreatingJob(true)}>
                {t(lang, 'staff.create_job')}
              </Button>
            </Card>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
            {jobs.map((job) => (
              <Card key={job.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2em' }}>{job.title}</h2>
                  <span
                    className="bo-badge"
                    style={{
                      background: 'var(--bo-info-bg)',
                      color: 'var(--bo-navy)',
                      padding: '2px 8px',
                      borderRadius: 'var(--bo-radius)',
                      fontSize: '0.85em',
                      fontWeight: 600,
                    }}
                  >
                    {job.employer?.name || 'Employer'}
                  </span>
                </div>

                {job.location_text && (
                  <p className="bo-hint" style={{ margin: 0 }}>
                    {job.location_text}
                  </p>
                )}

                {job.accommodations && job.accommodations.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--bo-space-1)', marginTop: 'var(--bo-space-2)' }}>
                    {job.accommodations.map((acc) => (
                      <span
                        key={acc}
                        style={{
                          fontSize: '0.8em',
                          background: 'var(--bo-surface)',
                          border: '1px solid var(--bo-border-subtle)',
                          borderRadius: '4px',
                          padding: '2px 6px',
                        }}
                      >
                        {acc}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
