import type { Job } from '../careers/match';
import { apiFetch, type ApiConfig } from './client';

export interface JobsResponse {
  items: Job[];
  next_cursor: string | null;
}

/** One page of published jobs. */
export async function fetchJobs(
  cfg: ApiConfig,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<JobsResponse> {
  const q = new URLSearchParams();
  if (opts.limit) q.set('limit', String(opts.limit));
  if (opts.cursor) q.set('cursor', opts.cursor);
  const qs = q.toString();
  return apiFetch<JobsResponse>(cfg, `/jobs${qs ? `?${qs}` : ''}`);
}

/** Every published job, following next_cursor (at most `maxPages` pages). */
export async function fetchAllJobs(cfg: ApiConfig, maxPages = 10): Promise<Job[]> {
  const all: Job[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const res: JobsResponse = await fetchJobs(cfg, { limit: 100, cursor });
    all.push(...(res.items ?? []));
    if (!res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return all;
}

export async function fetchJob(cfg: ApiConfig, id: string): Promise<Job> {
  return apiFetch<Job>(cfg, `/jobs/${encodeURIComponent(id)}`);
}
