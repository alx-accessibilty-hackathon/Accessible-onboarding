// Registration API (FB-3 / FE-B). All calls go through apiFetch.

import { apiFetch, type ApiConfig } from './client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Registration {
  id: string;
  flowId: string;
  currentStep: string;
  status: 'in_progress' | 'submitted';
  answers: Record<string, { value: unknown; version: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface SupportRequestData {
  subject: string;
  body: string;
  contactMethod?: string;
}

/* ------------------------------------------------------------------ */
/*  API functions                                                      */
/* ------------------------------------------------------------------ */

/** Start a new registration for the given flow. Returns a short-lived token. */
export async function createRegistration(
  cfg: ApiConfig,
  flowId: string,
): Promise<{ id: string; token: string }> {
  return apiFetch<{ id: string; token: string }>(cfg, '/registrations', {
    method: 'POST',
    body: JSON.stringify({ flowId }),
  });
}

/** Fetch a registration by id. */
export async function getRegistration(
  cfg: ApiConfig,
  id: string,
): Promise<Registration> {
  return apiFetch<Registration>(cfg, `/registrations/${encodeURIComponent(id)}`);
}

/** Update registration metadata (e.g. currentStep). */
export async function patchRegistration(
  cfg: ApiConfig,
  id: string,
  data: { currentStep?: string },
): Promise<void> {
  await apiFetch<undefined>(cfg, `/registrations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Save (or update) one answer. Returns the new server version so the caller
 * can pass it as base_version on the next write (optimistic-lock pattern).
 */
export async function saveAnswer(
  cfg: ApiConfig,
  regId: string,
  stepId: string,
  value: unknown,
  inputMethod: string,
  baseVersion?: number,
): Promise<{ version: number }> {
  return apiFetch<{ version: number }>(
    cfg,
    `/registrations/${encodeURIComponent(regId)}/answers/${encodeURIComponent(stepId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ value, inputMethod, baseVersion }),
    },
  );
}

/** Submit a support / help-request on behalf of the learner. */
export async function putSupportRequest(
  cfg: ApiConfig,
  regId: string,
  data: SupportRequestData,
): Promise<void> {
  await apiFetch<undefined>(
    cfg,
    `/registrations/${encodeURIComponent(regId)}/support-request`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

/** Record a consent decision. */
export async function postConsent(
  cfg: ApiConfig,
  regId: string,
  kind: string,
  granted: boolean,
  method: string,
): Promise<void> {
  await apiFetch<undefined>(
    cfg,
    `/registrations/${encodeURIComponent(regId)}/consents`,
    {
      method: 'POST',
      body: JSON.stringify({ kind, granted, method }),
    },
  );
}

/** Mark the registration as submitted (no turning back). */
export async function submit(
  cfg: ApiConfig,
  regId: string,
): Promise<void> {
  await apiFetch<undefined>(
    cfg,
    `/registrations/${encodeURIComponent(regId)}/submit`,
    { method: 'POST' },
  );
}
