// Base API client (FB-3). Feature calls go in their own files: registrations.ts, speech.ts,
// auth.ts (FE-B) and jobs.ts, employer.ts, applications.ts (FE-A).

export interface FieldError {
  field: string;
  code: string;
}

// Every API error has the same shape: { status, code, errors[] }.
// Show t(lang, `errors.${code}`) to the learner, never the raw message.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors: FieldError[];

  constructor(status: number, code: string, errors: FieldError[] = []) {
    super(code);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

export interface ApiConfig {
  origin: string; // '' = same site
  partnerKey: string; // X-Partner-Key
  token?: string | null; // learner or staff token
}

export async function apiFetch<T>(
  cfg: ApiConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Partner-Key', cfg.partnerKey);
  if (cfg.token) headers.set('Authorization', `Bearer ${cfg.token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`${cfg.origin}/api/v1${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; errors?: FieldError[] };
    throw new ApiError(res.status, body.code ?? 'internal_error', body.errors ?? []);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
