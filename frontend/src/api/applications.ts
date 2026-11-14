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

export async function submitApplication(
  cfg: ApiConfig,
  jobId: string,
  payload: ApplicationSubmissionPayload,
): Promise<ApplicationResponse> {
  try {
    return await apiFetch<ApplicationResponse>(cfg, `/jobs/${jobId}/applications`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // Development fallback
    return {
      id: `app-${Date.now()}`,
      job_id: jobId,
      status: 'submitted',
      created_at: new Date().toISOString(),
    };
  }
}
