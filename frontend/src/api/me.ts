// The learner's own data (requirement Q4): GET, PATCH and DELETE /me, with the partner key and
// the learner token. Shapes follow the round 3 contract exactly.

import type { DateAnswerValue } from '../lib/ethiopianCalendar';
import { apiFetch, type ApiConfig } from './client';
import type { SupportRequestData } from './registrations';

export type ContactMethod = 'phone' | 'telegram' | 'partner' | 'none' | '';

export interface Me {
  learner_id: string;
  /** The learner's latest registration (its support request is edited through it). */
  registration_id: string;
  status: 'draft' | 'registered' | string;
  full_name: string;
  preferred_name: string;
  contact_method: ContactMethod;
  phone: string; // E.164, e.g. +251912345678, or ''
  /** Confirmed with an SMS code on the profile page (optional). */
  phone_verified?: boolean;
  /** `ethiopian` may be missing: the profile page works it out from `iso`. */
  dob: DateAnswerValue | null;
  language: string;
  simple_mode: boolean;
  identity: { route: string; doc_type: string; level: string; has_last4: boolean } | null;
  support: SupportRequestData | null;
  referral: { partner_name: string; status: string; contact_preference: string } | null;
  registered_at: string | null;
}

/** Only the fields sent change. */
export interface MePatch {
  full_name?: string;
  preferred_name?: string;
  contact_method?: ContactMethod;
  phone?: string;
  dob?: DateAnswerValue | null;
  language?: string;
  simple_mode?: boolean;
}

export interface LearnerExport {
  exported_at: string;
  learner: Me;
  registration?: {
    id: string;
    flow_id: string;
    flow_version: number;
    status: string;
    current_step: string;
    created_at: string;
    updated_at: string;
  };
  answers?: Array<{
    question_id: string;
    value: unknown;
    input_method: string;
    version: number;
    updated_at: string;
  }>;
  identity_evidence?: Me['identity'];
  support_request?: Me['support'];
  referral?: Me['referral'];
  consents?: Array<{
    kind: string;
    granted: boolean;
    method: string;
    recorded_at: string;
  }>;
}

export async function fetchMe(cfg: ApiConfig): Promise<Me> {
  return apiFetch<Me>(cfg, '/me');
}

/** Export all learner data as JSON (Q4). */
export async function exportMe(cfg: ApiConfig): Promise<LearnerExport> {
  return apiFetch<LearnerExport>(cfg, '/me/export');
}

/** 409 not_registered: a draft may only change language and Simple mode. */
export async function patchMe(cfg: ApiConfig, body: MePatch): Promise<Me> {
  return apiFetch<Me>(cfg, '/me', { method: 'PATCH', body: JSON.stringify(body) });
}

/** Deletes the learner and everything about them on the server (204). */
export async function deleteMe(cfg: ApiConfig): Promise<void> {
  await apiFetch<undefined>(cfg, '/me', { method: 'DELETE' });
}

/**
 * Enter the code an organisation (such as AAAPD) gave me: I become "confirmed by a partner".
 * 422 `code`: code_wrong | code_expired | required; 429 too_many_attempts.
 */
export async function confirmVouch(
  cfg: ApiConfig,
  code: string,
): Promise<{ identity_level: string; partner_name: string }> {
  return apiFetch(cfg, '/me/vouch', { method: 'POST', body: JSON.stringify({ code }) });
}

/**
 * The optional phone check: text a 6-digit code to my stored phone (202). 503 sms_unavailable
 * (SMS is off), 409 already_exists (already confirmed), 429 rate_limited (a code less than a
 * minute ago), 422 phone sms_not_supported (not an Ethio Telecom number).
 */
export async function sendPhoneCode(
  cfg: ApiConfig,
): Promise<{ sent_to: string; expires_at: string }> {
  return apiFetch(cfg, '/me/phone-verification', { method: 'POST' });
}

/** Check the code from the SMS; answers my profile with phone_verified true. 422 code_wrong. */
export async function confirmPhoneCode(cfg: ApiConfig, code: string): Promise<Me> {
  return apiFetch<Me>(cfg, '/me/phone-verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
