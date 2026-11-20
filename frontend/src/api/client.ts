// Base API client (FB-3). Feature calls go in their own files: registrations.ts, speech.ts,
// auth.ts (FE-B) and jobs.ts, employer.ts, applications.ts (FE-A).

export interface FieldError {
  field: string;
  code: string;
}

// Every API error has the same shape: { status, code, title, errors[] }.
// A 409 answer_conflict also carries `current`: the answer another device saved.
// Show t(lang, `errors.${code}`) to the learner, never the raw message.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldError[];
  readonly current?: unknown;

  constructor(status: number, code: string, errors: FieldError[] = [], current?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.errors = errors;
    this.current = current;
  }
}

export interface ApiConfig {
  origin: string; // '' = same site
  partnerKey: string; // X-Partner-Key ('' for staff calls)
  token?: string | null; // learner or staff token
}

/** Absolute or same-site URL for an API path ("/config" -> "<origin>/api/v1/config"). */
export function apiUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/api/v1${path}`;
}

/* ------------------------------------------------------------------ */
/*  A server that is waking up                                         */
/* ------------------------------------------------------------------ */
// A hosted API on a free plan sleeps when nobody uses it and takes up to a minute to wake.
// Reading requests (GET) are tried again during that time instead of failing at once, and
// while one takes long, `serverWaking()` is true (the widget then says it is connecting).
// Writing requests are never repeated here: the offline outbox sends answers again itself.

const WAKE_BUDGET_MS = 75_000; // keep trying a GET for this long
const ATTEMPT_TIMEOUT_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const SLOW_AFTER_MS = 4_000; // a GET taking longer than this: "Connecting…"
// What a sleeping or restarting host answers (from its proxy, not from our API).
const WAKING_STATUS = new Set([502, 503, 504]);

let slowCalls = 0;
const wakeListeners = new Set<() => void>();

function changeSlow(delta: number): void {
  const before = slowCalls > 0;
  slowCalls = Math.max(0, slowCalls + delta);
  if (before !== slowCalls > 0) wakeListeners.forEach((l) => l());
}

/** A reading request is taking long (the server is probably waking up). */
export function serverWaking(): boolean {
  return slowCalls > 0;
}

export function subscribeServerWaking(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ErrorBody = { code?: string; errors?: FieldError[]; current?: unknown };

export async function apiFetch<T>(
  cfg: ApiConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (cfg.partnerKey) headers.set('X-Partner-Key', cfg.partnerKey);
  if (cfg.token) headers.set('Authorization', `Bearer ${cfg.token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');

  const url = apiUrl(cfg.origin, path);
  // Only reads the caller doesn't cancel itself are tried again.
  const retry = (init.method ?? 'GET').toUpperCase() === 'GET' && !init.signal;
  const started = Date.now();
  let slow = false;
  const slowTimer = retry
    ? setTimeout(() => {
        slow = true;
        changeSlow(1);
      }, SLOW_AFTER_MS)
    : undefined;

  try {
    for (let attempt = 0; ; attempt++) {
      const canRetry = () =>
        retry &&
        Date.now() - started < WAKE_BUDGET_MS &&
        (typeof navigator === 'undefined' || navigator.onLine !== false);
      const pause = () => wait(Math.min(2_000 * 2 ** attempt, 8_000));

      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          headers,
          signal:
            init.signal ?? AbortSignal.timeout(retry ? ATTEMPT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS),
        });
      } catch {
        if (canRetry()) {
          await pause();
          continue;
        }
        throw new ApiError(0, 'network');
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as ErrorBody;
        // Our API always says what went wrong (`code`); a bare 502/503/504 is the host waking.
        if (WAKING_STATUS.has(res.status) && !body.code && canRetry()) {
          await pause();
          continue;
        }
        throw new ApiError(
          res.status,
          body.code ?? (res.status === 404 ? 'not_found' : 'internal_error'),
          body.errors ?? [],
          body.current,
        );
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
  } finally {
    clearTimeout(slowTimer);
    if (slow) changeSlow(-1);
  }
}

/** The error code of anything thrown by an API call ('network' for non-API failures). */
export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : 'internal_error';
}
