import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, loadSession, saveSession } from './auth';
import { apiFetch, ApiError } from './client';

describe('api/client & session', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearSession();
  });

  it('adds X-Partner-Key and Authorization headers to requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const cfg = { origin: 'http://test.api', partnerKey: 'pk_abc', token: 'bearer_token_xyz' };
    const res = await apiFetch<{ ok: boolean }>(cfg, '/config');

    expect(res).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test.api/api/v1/config',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const callHeaders = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(callHeaders.get('X-Partner-Key')).toBe('pk_abc');
    expect(callHeaders.get('Authorization')).toBe('Bearer bearer_token_xyz');
  });

  it('parses error responses and returns ApiError with status and code', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ code: 'phone_invalid', errors: [{ field: 'phone', code: 'invalid' }] }),
          {
            status: 422,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
    );

    const cfg = { origin: '', partnerKey: 'pk_demo' };
    await expect(apiFetch(cfg, '/registrations')).rejects.toThrowError(ApiError);

    try {
      await apiFetch(cfg, '/registrations');
    } catch (e: unknown) {
      const err = e as ApiError;
      expect(err.status).toBe(422);
      expect(err.code).toBe('phone_invalid');
      expect(err.errors).toHaveLength(1);
    }
  });

  it('persists and clears learner session in IndexedDB', async () => {
    expect(await loadSession()).toBeNull();

    await saveSession('learner_tok_123', 'reg_id_abc');
    const session = await loadSession();
    expect(session).toEqual({
      token: 'learner_tok_123',
      registrationId: 'reg_id_abc',
    });

    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
