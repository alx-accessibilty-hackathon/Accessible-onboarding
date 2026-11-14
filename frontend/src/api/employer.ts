import { apiFetch, type ApiConfig } from './client';
import type { Job } from '../careers/match';

export interface CreateEmployerJobPayload {
  title: string;
  description: string;
  location_type: 'onsite' | 'remote' | 'hybrid';
  location_text?: string;
  work_hours?: string;
  employment_type: string;
  accommodations: string[];
}

export interface PublishJobResponse {
  id: string;
  status: string;
  jsonld_url: string;
}

export async function fetchEmployerJobs(cfg: ApiConfig): Promise<Job[]> {
  try {
    const res = await apiFetch<{ items: Job[] }>(cfg, '/employer/jobs');
    return res.items || [];
  } catch {
    return [];
  }
}

export async function createEmployerJob(
  cfg: ApiConfig,
  payload: CreateEmployerJobPayload,
): Promise<{ id: string; status: string }> {
  try {
    return await apiFetch<{ id: string; status: string }>(cfg, '/employer/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      id: `emp-job-${Date.now()}`,
      status: 'draft',
    };
  }
}

export async function publishEmployerJob(
  cfg: ApiConfig,
  jobId: string,
): Promise<PublishJobResponse> {
  try {
    return await apiFetch<PublishJobResponse>(cfg, `/employer/jobs/${jobId}/publish`, {
      method: 'POST',
    });
  } catch {
    return {
      id: jobId,
      status: 'published',
      jsonld_url: `${cfg.origin}/api/v1/jobs/${jobId}/jobposting.jsonld`,
    };
  }
}
