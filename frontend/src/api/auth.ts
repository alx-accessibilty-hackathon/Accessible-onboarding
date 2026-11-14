// Auth / session management (FB-3 / FE-B).
// The learner session lives in IndexedDB (via widgetStore) so the widget can resume across
// page reloads without cookies. Staff calls go through apiFetch without a partner key.

import { clear, del, get, set } from 'idb-keyval';
import { widgetStore } from '../offline/db';
import { apiFetch, type ApiConfig } from './client';

/* ------------------------------------------------------------------ */
/*  Types (auth_dto.go)                                                */
/* ------------------------------------------------------------------ */

export interface StaffUser {
  id: string;
  email: string;
  display_name: string;
  role: string; // employer | partner_staff | support | admin
  partner_id: string | null;
  employer_id: string | null;
}

export interface StaffLoginResponse {
  token: string;
  expires_at: string;
  role: string;
  partner_id: string | null;
  employer_id: string | null;
  display_name: string;
}

/* ------------------------------------------------------------------ */
/*  Learner session (IndexedDB)                                        */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'session:token';
const REG_KEY = 'session:registrationId';
const LEARNER_KEY = 'session:learnerId';
const REGISTERED_KEY = 'session:registered';

export interface LearnerSession {
  token: string;
  registrationId: string;
  learnerId?: string;
}

/** Persist the learner token + registration id (and the learner id when known). */
export async function saveSession(
  token: string,
  registrationId: string,
  learnerId?: string,
): Promise<void> {
  const store = widgetStore();
  await set(TOKEN_KEY, token, store);
  await set(REG_KEY, registrationId, store);
  if (learnerId) await set(LEARNER_KEY, learnerId, store);
}

/** Load the learner session. Returns null if none is stored. */
export async function loadSession(): Promise<LearnerSession | null> {
  const store = widgetStore();
  const token = await get<string>(TOKEN_KEY, store);
  const registrationId = await get<string>(REG_KEY, store);
  if (!token || !registrationId) return null;
  const learnerId = await get<string>(LEARNER_KEY, store);
  return learnerId ? { token, registrationId, learnerId } : { token, registrationId };
}

/** Remember that this learner finished signing up (they may apply for jobs). */
export async function markRegistered(registered: boolean): Promise<void> {
  await set(REGISTERED_KEY, registered, widgetStore());
}

export async function isMarkedRegistered(): Promise<boolean> {
  return (await get<boolean>(REGISTERED_KEY, widgetStore())) === true;
}

/** Clear the learner session (logout / reset). */
export async function clearSession(): Promise<void> {
  const store = widgetStore();
  await del(TOKEN_KEY, store);
  await del(REG_KEY, store);
  await del(LEARNER_KEY, store);
  await del(REGISTERED_KEY, store);
}

/** "Forget me on this phone": session, outbox, saved answers and voice clips. */
export async function forgetEverything(): Promise<void> {
  await clear(widgetStore());
  try {
    localStorage.removeItem('bo:speech_consent');
  } catch {
    // storage blocked: nothing to remove
  }
}

/** End the session on the server. A learner or staff token goes in cfg.token. */
export async function logout(cfg: ApiConfig): Promise<void> {
  await apiFetch<undefined>(cfg, '/auth/logout', { method: 'POST' });
}

/* ------------------------------------------------------------------ */
/*  Staff sign-in                                                      */
/* ------------------------------------------------------------------ */

/** Sign a staff member in. Throws ApiError (401 unauthorized for a wrong email or password). */
export async function staffLogin(
  origin: string,
  email: string,
  password: string,
): Promise<StaffLoginResponse> {
  return apiFetch<StaffLoginResponse>({ origin, partnerKey: '' }, '/auth/staff/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** The signed-in staff member. */
export async function staffMe(origin: string, token: string): Promise<StaffUser> {
  return apiFetch<StaffUser>({ origin, partnerKey: '', token }, '/auth/staff/me');
}
