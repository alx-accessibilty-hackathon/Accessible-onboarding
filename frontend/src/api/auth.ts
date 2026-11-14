// Auth / session management (FB-3 / FE-B).
// Learner session lives in IndexedDB (via widgetStore) so the widget can
// resume across page reloads without cookies. Staff helpers use plain fetch.

import { get, set, del } from 'idb-keyval';
import { widgetStore } from '../offline/db';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

/* ------------------------------------------------------------------ */
/*  Learner session (IndexedDB)                                        */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = 'session:token';
const REG_KEY = 'session:registrationId';

/** Persist the learner token + registration id. */
export async function saveSession(
  token: string,
  registrationId: string,
): Promise<void> {
  const store = widgetStore();
  await set(TOKEN_KEY, token, store);
  await set(REG_KEY, registrationId, store);
}

/** Load the learner session. Returns null if none is stored. */
export async function loadSession(): Promise<{
  token: string;
  registrationId: string;
} | null> {
  const store = widgetStore();
  const token = await get<string>(TOKEN_KEY, store);
  const registrationId = await get<string>(REG_KEY, store);
  if (!token || !registrationId) return null;
  return { token, registrationId };
}

/** Clear the learner session (logout / reset). */
export async function clearSession(): Promise<void> {
  const store = widgetStore();
  await del(TOKEN_KEY, store);
  await del(REG_KEY, store);
}

/* ------------------------------------------------------------------ */
/*  Staff login (simple fetch, no apiFetch — origin differs per env)   */
/* ------------------------------------------------------------------ */

/** Authenticate a staff user and return a bearer token. */
export async function staffLogin(
  origin: string,
  email: string,
  password: string,
): Promise<{ token: string }> {
  const res = await fetch(`${origin}/api/v1/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
    };
    throw new Error(body.code ?? 'login_failed');
  }
  return (await res.json()) as { token: string };
}

/** Fetch the currently authenticated staff user profile. */
export async function staffMe(
  origin: string,
  token: string,
): Promise<StaffUser> {
  const res = await fetch(`${origin}/api/v1/staff/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
    };
    throw new Error(body.code ?? 'unauthorized');
  }
  return (await res.json()) as StaffUser;
}
