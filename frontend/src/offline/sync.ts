// Sync engine (FB-7): flush the outbox when connectivity returns.
// Called on app start, when the browser fires the "online" event and after each enqueue.

import { type ApiConfig, ApiError } from '../api/client';
import { saveAnswer, type Answer } from '../api/registrations';
import { clearSynced, dequeueAll } from './outbox';

export interface SyncHooks {
  /** The latest server version known for a step (wins over the version stored at enqueue). */
  baseVersion?: (stepId: string) => number | undefined;
  /** The server saved the answer. `superseded` = a newer local value is already queued. */
  onSynced?: (stepId: string, answer: Answer, superseded: boolean) => void;
  /** The server refused the value (422); it is dropped from the outbox. */
  onRejected?: (stepId: string, code: string) => void;
}

// One sync at a time per registration, so the same answer is never sent twice in parallel.
const running = new Map<string, Promise<{ synced: number; failed: number }>>();

/**
 * Attempt to send every queued answer for `regId`.
 *
 * - On success the entry is removed from the outbox (unless a newer value was queued meanwhile).
 * - On 409 answer_conflict `onConflict(stepId, current)` is called with the server's answer
 *   so the UI can adopt it and tell the learner; the entry is removed.
 * - Other failures are counted but do not throw; the entry stays queued
 *   for the next sync attempt.
 */
export async function syncOutbox(
  cfg: ApiConfig,
  regId: string,
  onConflict: (stepId: string, current?: Answer) => void,
  hooks: SyncHooks = {},
): Promise<{ synced: number; failed: number }> {
  const previous = running.get(regId) ?? Promise.resolve({ synced: 0, failed: 0 });
  const next = previous
    .catch(() => ({ synced: 0, failed: 0 }))
    .then(() => runSync(cfg, regId, onConflict, hooks));
  running.set(regId, next);
  try {
    return await next;
  } finally {
    if (running.get(regId) === next) running.delete(regId);
  }
}

async function runSync(
  cfg: ApiConfig,
  regId: string,
  onConflict: (stepId: string, current?: Answer) => void,
  hooks: SyncHooks,
): Promise<{ synced: number; failed: number }> {
  const entries = await dequeueAll(regId);

  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    const base = hooks.baseVersion?.(entry.stepId) ?? entry.baseVersion ?? 0;
    try {
      const answer = await saveAnswer(
        cfg,
        regId,
        entry.stepId,
        entry.value,
        entry.inputMethod,
        base,
      );
      const removed = await clearSynced(regId, entry.stepId, entry.queuedAt);
      hooks.onSynced?.(entry.stepId, answer, !removed);
      synced++;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Another device saved a newer version, or the registration is already submitted.
        const current = err.current as Answer | undefined;
        if (current !== undefined) onConflict(entry.stepId, current);
        else onConflict(entry.stepId);
        await clearSynced(regId, entry.stepId);
        failed++;
      } else if (err instanceof ApiError && err.status === 422) {
        hooks.onRejected?.(entry.stepId, err.errors[0]?.code ?? err.code);
        await clearSynced(regId, entry.stepId, entry.queuedAt);
        failed++;
      } else {
        // Network or server error — leave in queue for next attempt.
        failed++;
        if (err instanceof ApiError && err.status === 0) break; // offline: stop trying the rest
      }
    }
  }

  return { synced, failed };
}
