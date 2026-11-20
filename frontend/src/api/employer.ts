import type { Job } from '../careers/match';
import { apiFetch, type ApiConfig } from './client';

export interface CreateEmployerJobPayload {
  title: string;
  description: string;
  location_type: 'onsite' | 'remote' | 'hybrid';
  location_text?: string;
  work_hours?: string;
  employment_type: string;
  accommodations: string[]; // needs codes, never "other"
}

export interface PublishJobResponse {
  id: string;
  status: string;
  jsonld_url: string;
}

/** The signed-in employer's jobs (drafts and published). Staff token in cfg.token. */
export async function fetchEmployerJobs(cfg: ApiConfig): Promise<Job[]> {
  const res = await apiFetch<{ items: Job[]; next_cursor: string | null }>(cfg, '/employer/jobs');
  return res.items ?? [];
}

/** Create a draft job. */
export async function createEmployerJob(
  cfg: ApiConfig,
  payload: CreateEmployerJobPayload,
): Promise<Job> {
  return apiFetch<Job>(cfg, '/employer/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Publish a draft job. */
export async function publishEmployerJob(
  cfg: ApiConfig,
  jobId: string,
): Promise<PublishJobResponse> {
  return apiFetch<PublishJobResponse>(cfg, `/employer/jobs/${encodeURIComponent(jobId)}/publish`, {
    method: 'POST',
  });
}

/** One application to the employer's job. `support` only when the applicant shared it. */
export interface JobApplication {
  id: string;
  status: string;
  created_at: string;
  answers: Record<string, { value: unknown; input_method?: string }>;
  attach_support: boolean;
  applicant: {
    full_name: string;
    preferred_name: string;
    contact_method: string;
    phone: string;
    language: string;
    /** self_declared | partner_attested (a partner organisation vouched) | verified */
    identity_level?: string;
  };
  support: { needs: string[]; other_text: string } | null;
}

/** Applications to one of the employer's own jobs (another employer's job: 404). */
export async function fetchJobApplications(
  cfg: ApiConfig,
  jobId: string,
): Promise<JobApplication[]> {
  const res = await apiFetch<{ items: JobApplication[]; next_cursor: string | null }>(
    cfg,
    `/employer/jobs/${encodeURIComponent(jobId)}/applications`,
  );
  return res.items ?? [];
}

/**
 * The public JobPosting JSON-LD of a published job. Read through our own API origin (the
 * jsonld_url from publish may point at the public host, which this page can't always reach).
 */
export async function fetchJobPostingJsonLd(origin: string, jobId: string): Promise<object> {
  return apiFetch<object>(
    { origin, partnerKey: '' },
    `/jobs/${encodeURIComponent(jobId)}/jobposting.jsonld`,
  );
}
