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

export async function apiFetch<T>(cfg: ApiConfig, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (cfg.partnerKey) headers.set('X-Partner-Key', cfg.partnerKey);
  if (cfg.token) headers.set('Authorization', `Bearer ${cfg.token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(apiUrl(cfg.origin, path), {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: string;
      errors?: FieldError[];
      current?: unknown;
    };
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

/** The error code of anything thrown by an API call ('network' for non-API failures). */
export function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : 'internal_error';
}
