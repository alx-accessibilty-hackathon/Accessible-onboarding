// Registration API (FB-3 / FE-B). All calls go through apiFetch.
// Field names follow backend/Delivery/Controllers/registration_dto.go exactly.

import { apiFetch, type ApiConfig } from './client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type InputMethod = 'typed' | 'voice' | 'choice' | 'partner';

export interface SessionInfo {
  token: string;
  expires_at: string;
}

export interface CreateRegistrationResponse {
  registration_id: string;
  learner_id: string;
  status: string;
  current_step: string;
  session: SessionInfo;
}

/** One saved answer, as the server returns it (cleaned, with its version). */
export interface Answer {
  question_id: string;
  value: unknown;
  input_method: InputMethod;
  version: number;
  updated_at: string;
}

export interface Registration {
  registration_id: string;
  status: 'draft' | 'submitted' | string;
  current_step: string;
  language: string;
  simple_mode: boolean;
  answers: Record<string, Answer>;
  support_request: { submitted: boolean };
  updated_at: string;
}

export interface SupportRequestData {
  needs: string[];
  other_text: string;
  share_with: { courses: boolean; employers: boolean };
}

export interface SubmitResponse {
  status: string; // "registered"
  learner_id: string;
  identity_level: string;
  referral?: { id: string; partner_name: string; status: string };
}

export interface ResumeLink {
  url: string;
  code: string;
  expires_at: string;
}

export interface ResumeLookupResponse {
  registration_id: string;
  /** 'none': a sign-in code of a learner with no date of birth or phone (nothing to confirm). */
  check: 'dob' | 'phone' | 'none';
  /** 'resume': an unfinished sign-up; 'sign_in': a sign-in code of a finished profile. */
  kind?: 'resume' | 'sign_in';
}

export interface ResumeVerifyResponse {
  registration_id: string;
  kind?: 'resume' | 'sign_in';
  session: SessionInfo;
}

export interface ResumeDob {
  calendar: string;
  year: number;
  month: number;
  day: number;
}

export type ConsentKind =
  'data_processing' | 'cloud_speech' | 'sms' | 'telegram' | 'partner_access';
export type ConsentMethod = 'tap' | 'sms_code' | 'spoken' | 'partner_witnessed';

const reg = (id: string) => `/registrations/${encodeURIComponent(id)}`;

/* ------------------------------------------------------------------ */
/*  API functions                                                      */
/* ------------------------------------------------------------------ */

/** Start a new registration. Returns the learner session token. */
export async function createRegistration(
  cfg: ApiConfig,
  body: { flow_id: string; language: string; simple_mode: boolean; flow_version?: number },
): Promise<CreateRegistrationResponse> {
  return apiFetch<CreateRegistrationResponse>(cfg, '/registrations', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Fetch a registration (with every saved answer) by id. */
export async function getRegistration(cfg: ApiConfig, id: string): Promise<Registration> {
  return apiFetch<Registration>(cfg, reg(id));
}

/** Update progress or preferences. Only the fields sent change. */
export async function patchRegistration(
  cfg: ApiConfig,
  id: string,
  data: { current_step?: string; language?: string; simple_mode?: boolean },
): Promise<void> {
  await apiFetch<undefined>(cfg, reg(id), { method: 'PATCH', body: JSON.stringify(data) });
}

/**
 * Save (or update) one answer of a `storage: "answer"` step. Returns the saved answer with the
 * cleaned value and the new version, which is the base_version of the next write.
 */
export async function saveAnswer(
  cfg: ApiConfig,
  regId: string,
  stepId: string,
  value: unknown,
  inputMethod: string,
  baseVersion = 0,
): Promise<Answer> {
  return apiFetch<Answer>(cfg, `${reg(regId)}/answers/${encodeURIComponent(stepId)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, input_method: inputMethod, base_version: baseVersion }),
  });
}

/** Save the private support request (the `storage: "support"` steps). */
export async function putSupportRequest(
  cfg: ApiConfig,
  regId: string,
  data: SupportRequestData,
): Promise<{ status: string; updated_at: string }> {
  return apiFetch(cfg, `${reg(regId)}/support-request`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Record a consent decision. */
export async function postConsent(
  cfg: ApiConfig,
  regId: string,
  kind: ConsentKind,
  granted: boolean,
  method: ConsentMethod = 'tap',
): Promise<void> {
  await apiFetch<unknown>(cfg, `${reg(regId)}/consents`, {
    method: 'POST',
    body: JSON.stringify({ kind, granted, method }),
  });
}

/** Finish the sign-up. 422 lists the missing required steps in errors[].field. */
export async function submit(cfg: ApiConfig, regId: string): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>(cfg, `${reg(regId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** "Continue on another device": a link and a short code (Should). */
export async function createResumeLink(
  cfg: ApiConfig,
  regId: string,
  body: { send_via?: 'sms' | 'telegram' | 'none'; phone?: string } = { send_via: 'none' },
): Promise<ResumeLink> {
  return apiFetch<ResumeLink>(cfg, `${reg(regId)}/resume-links`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Look up a resume code or token to know what check to ask. */
export async function resumeLookup(
  cfg: ApiConfig,
  body: { code?: string; token?: string },
): Promise<ResumeLookupResponse> {
  return apiFetch<ResumeLookupResponse>(cfg, '/resume/lookup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Verify a resume check (DOB or phone last 4) to receive a learner session. */
export async function resumeVerify(
  cfg: ApiConfig,
  body: {
    code?: string;
    token?: string;
    dob?: ResumeDob;
    phone_last4?: string;
  },
): Promise<ResumeVerifyResponse> {
  return apiFetch<ResumeVerifyResponse>(cfg, '/resume/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
