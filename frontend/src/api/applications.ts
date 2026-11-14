import { apiFetch, type ApiConfig } from './client';

export interface ApplicationAnswerItem {
  value: unknown;
  input_method: 'typed' | 'voice' | 'choice' | 'partner';
}

export interface ApplicationSubmissionPayload {
  answers: Record<string, ApplicationAnswerItem>;
  attach_support_request: boolean;
}

export interface ApplicationResponse {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
}

/**
 * Apply for a published job with the learner token.
 * 403 forbidden = not registered yet; 409 already_exists = applied before.
 */
export async function submitApplication(
  cfg: ApiConfig,
  jobId: string,
  payload: ApplicationSubmissionPayload,
): Promise<ApplicationResponse> {
  return apiFetch<ApplicationResponse>(cfg, `/jobs/${encodeURIComponent(jobId)}/applications`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
