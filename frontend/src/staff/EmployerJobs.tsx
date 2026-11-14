import needsVocab from '@shared/vocab/needs.json';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../a11y/announce';
import type { StaffUser } from '../api/auth';
import { apiUrl, ApiError, errorCode, type ApiConfig } from '../api/client';
import {
  createEmployerJob,
  fetchEmployerJobs,
  fetchJobPostingJsonLd,
  publishEmployerJob,
  type CreateEmployerJobPayload,
} from '../api/employer';
import type { Job } from '../careers/match';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FlowRunner, type FlowHooks, type SubmitOutcome } from '../engine/FlowRunner';
import type { EngineState } from '../engine/types';
import { t } from '../i18n/t';

export interface EmployerJobsProps {
  user: StaffUser;
  token: string;
  apiOrigin?: string;
  lang?: string;
  onLogout: () => void;
}

function text(state: EngineState, stepId: string): string {
  const v = state.answers[stepId]?.value;
  return typeof v === 'string' ? v.trim() : '';
}

/** The employer-job flow answers as the POST /employer/jobs body. */
function toPayload(state: EngineState): CreateEmployerJobPayload {
  const locationType = text(state, 'location_type') as CreateEmployerJobPayload['location_type'];
  const accommodations = state.answers.accommodations?.value;
  const payload: CreateEmployerJobPayload = {
    title: text(state, 'title'),
    description: text(state, 'description'),
    location_type: locationType,
    employment_type: text(state, 'employment_type'),
    // Only codes from the shared list; "other" is never offered to employers.
    accommodations: Array.isArray(accommodations)
      ? (accommodations as string[]).filter((c) => c !== 'other')
      : [],
  };
  const where = text(state, 'location_text');
  if (locationType !== 'remote' && where) payload.location_text = where;
  const hours = text(state, 'work_hours');
  if (hours) payload.work_hours = hours;
  return payload;
}

// ST-2: the employer's jobs, "Create a job" (the employer-job flow), publish, JobPosting JSON-LD.
export function EmployerJobs({
  user,
  token,
  apiOrigin = '',
  lang = 'en',
  onLogout,
}: EmployerJobsProps) {
  const api = useMemo<ApiConfig>(
    () => ({ origin: apiOrigin, partnerKey: '', token }),
    [apiOrigin, token],
  );
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [published, setPublished] = useState<{ id: string; url: string } | null>(null);
  const [jsonLd, setJsonLd] = useState<object | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [listMessage, setListMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const isEmployer = user.role === 'employer';

  useEffect(() => {
    if (!isEmployer) return;
    let active = true;
    setLoadError(null);
    fetchEmployerJobs(api)
      .then((items) => {
        if (active) setJobs(items);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onLogout();
        else setLoadError(errorCode(err));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, reload, isEmployer]);

  const startCreate = () => {
    setPublished(null);
    setJsonLd(null);
    setListMessage(null);
    setFormKey((k) => k + 1);
    setIsCreatingJob(true);
  };

  const backToList = () => {
    setIsCreatingJob(false);
    setReload((n) => n + 1);
    window.setTimeout(() => headingRef.current?.focus(), 0);
  };

  const publishDraft = useCallback(
    async (job: Job) => {
      setPublishingId(job.id);
      setListMessage(null);
      try {
        await publishEmployerJob(api, job.id);
        const msg = t(lang, 'staff.publish_done', { title: job.title });
        setListMessage({ ok: true, text: msg });
        announce(msg);
        setReload((n) => n + 1);
      } catch (err) {
        setListMessage({ ok: false, text: t(lang, `errors.${errorCode(err)}`) });
      } finally {
        setPublishingId(null);
      }
    },
    [api, lang],
  );

  const hooks = useMemo<FlowHooks>(
    () => ({
      onSubmit: async (state): Promise<SubmitOutcome> => {
        let jobId: string;
        try {
          const created = await createEmployerJob(api, toPayload(state));
          jobId = created.id;
        } catch (err) {
          const code = errorCode(err);
          if (err instanceof ApiError && err.status === 422)
            return { ok: false, code, fields: err.errors };
          return { ok: false, code };
        }
        try {
          const res = await publishEmployerJob(api, jobId);
          setPublished({ id: res.id, url: res.jsonld_url });
        } catch {
          setReload((n) => n + 1);
          return { ok: false, code: 'publish_failed' };
        }
        try {
          setJsonLd(await fetchJobPostingJsonLd(apiOrigin, jobId));
        } catch {
          // The link below still works.
        }
        setReload((n) => n + 1);
        return { ok: true };
      },
    }),
    [api, apiOrigin],
  );

  return (
    <div
      className="bo-employer-dashboard"
      style={{ width: '100%', maxWidth: '48em', margin: '0 auto' }}
    >
      <div
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
          <p className="bo-hint" style={{ margin: 0 }}>
            {t(lang, 'staff.signed_in_as', { name: user.display_name || user.email })}
          </p>
        </div>

        <div className="bo-actions">
          {isEmployer &&
            (!isCreatingJob ? (
              <Button variant="primary" onClick={startCreate}>
                {t(lang, 'staff.create_job')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={backToList}>
                {t(lang, 'staff.back_to_jobs')}
              </Button>
            ))}

          <Button variant="secondary" onClick={onLogout}>
            {t(lang, 'staff.signout_button')}
          </Button>
        </div>
      </div>

      {!isEmployer ? (
        <Card>
          <h1 style={{ fontSize: '1.4em' }}>{t(lang, 'staff.jobs_title')}</h1>
          <p>{t(lang, 'staff.not_employer', { role: user.role })}</p>
        </Card>
      ) : isCreatingJob ? (
        <Card style={{ padding: 'var(--bo-space-5)' }}>
          <FlowRunner
            key={formKey}
            flowId="employer-job"
            lang={lang}
            audience="employer"
            voice={false}
            manageTitle={false}
            hooks={hooks}
            jobPostingJsonLd={jsonLd}
            renderDone={() => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
                {published && (
                  <p style={{ margin: 0 }}>
                    <a
                      href={
                        published.url ||
                        apiUrl(apiOrigin, `/jobs/${published.id}/jobposting.jsonld`)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--bo-primary)', overflowWrap: 'anywhere' }}
                    >
                      {t(lang, 'staff.view_jsonld')}
                    </a>
                  </p>
                )}
                <div className="bo-actions">
                  <Button variant="secondary" onClick={backToList}>
                    {t(lang, 'staff.back_to_jobs')}
                  </Button>
                </div>
              </div>
            )}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
          <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0, fontSize: '1.5em' }}>
            {t(lang, 'staff.jobs_title')}
          </h1>

          {listMessage && (
            <Banner variant={listMessage.ok ? 'success' : 'error'}>{listMessage.text}</Banner>
          )}

          {loadError && (
            <Banner variant="error">
              <p style={{ margin: '0 0 var(--bo-space-2) 0' }}>{t(lang, `errors.${loadError}`)}</p>
              <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
                {t(lang, 'common.try_again')}
              </Button>
            </Banner>
          )}

          {!jobs && !loadError && <p>{t(lang, 'common.loading')}</p>}

          {jobs && jobs.length === 0 && (
            <Card style={{ textAlign: 'center', padding: 'var(--bo-space-6)' }}>
              <p style={{ margin: '0 0 var(--bo-space-4) 0', color: 'var(--bo-text-muted)' }}>
                {t(lang, 'staff.no_jobs')}
              </p>
              <Button variant="primary" onClick={startCreate}>
                {t(lang, 'staff.create_job')}
              </Button>
            </Card>
          )}

          {jobs && jobs.length > 0 && (
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
              {jobs.map((job) => {
                const isPublished = job.status === 'published';
                return (
                  <li key={job.id}>
                    <Card
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-2)' }}
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
                        <h2 style={{ margin: 0, fontSize: '1.2em' }}>{job.title}</h2>
                        <span
                          style={{
                            background: isPublished ? 'var(--bo-info-bg)' : 'var(--bo-bg)',
                            color: 'var(--bo-navy)',
                            border: '1px solid var(--bo-border-strong)',
                            padding: '2px 8px',
                            borderRadius: 'var(--bo-radius)',
                            fontSize: '0.85em',
                            fontWeight: 600,
                          }}
                        >
                          {t(lang, isPublished ? 'staff.published' : 'staff.draft')}
                        </span>
                      </div>

                      <p className="bo-hint" style={{ margin: 0 }}>
                        {job.location_text ||
                          t(lang, `employer.location_type.${job.location_type}`)}
                      </p>

                      {job.accommodations && job.accommodations.length > 0 && (
                        <ul
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 'var(--bo-space-1)',
                            margin: 0,
                            padding: 0,
                            listStyle: 'none',
                          }}
                        >
                          {job.accommodations.map((acc) => {
                            const item = needsVocab.items.find((n) => n.code === acc);
                            return (
                              <li
                                key={acc}
                                style={{
                                  fontSize: '0.8em',
                                  background: 'var(--bo-bg)',
                                  border: '1px solid var(--bo-border-subtle)',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                }}
                              >
                                {item ? t(lang, item.employer) : acc}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <div className="bo-actions">
                        {isPublished ? (
                          <a
                            href={apiUrl(apiOrigin, `/jobs/${job.id}/jobposting.jsonld`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'var(--bo-primary)',
                              display: 'inline-block',
                              minHeight: 'var(--bo-target)',
                              paddingBlock: 'var(--bo-space-2)',
                            }}
                          >
                            {t(lang, 'staff.view_jsonld_for', { title: job.title })}
                          </a>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => void publishDraft(job)}
                            disabled={publishingId === job.id}
                          >
                            {t(lang, 'staff.publish_job', { title: job.title })}
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
