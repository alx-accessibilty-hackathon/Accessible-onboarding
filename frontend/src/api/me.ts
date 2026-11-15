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

export async function fetchMe(cfg: ApiConfig): Promise<Me> {
  return apiFetch<Me>(cfg, '/me');
}

/** 409 not_registered: a draft may only change language and Simple mode. */
export async function patchMe(cfg: ApiConfig, body: MePatch): Promise<Me> {
  return apiFetch<Me>(cfg, '/me', { method: 'PATCH', body: JSON.stringify(body) });
}

/** Deletes the learner and everything about them on the server (204). */
export async function deleteMe(cfg: ApiConfig): Promise<void> {
  await apiFetch<undefined>(cfg, '/me', { method: 'DELETE' });
}
