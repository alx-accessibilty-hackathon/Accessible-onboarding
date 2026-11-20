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

/** One of my applications: the support passport (may this employer see my support needs?). */
export interface MyApplication {
  id: string;
  job_id: string;
  job_title: string;
  employer_name: string;
  status: string;
  share_support: boolean;
  created_at: string;
}

/** GET /me/applications: my applications, newest first (learner token). */
export async function listMyApplications(cfg: ApiConfig): Promise<MyApplication[]> {
  const res = await apiFetch<{ items: MyApplication[] }>(cfg, '/me/applications');
  return res.items ?? [];
}

/** PATCH /me/applications/{id}: share my support needs with this employer, or stop sharing. */
export async function setSupportSharing(
  cfg: ApiConfig,
  applicationId: string,
  share: boolean,
): Promise<MyApplication> {
  return apiFetch<MyApplication>(cfg, `/me/applications/${encodeURIComponent(applicationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ share_support: share }),
  });
}
