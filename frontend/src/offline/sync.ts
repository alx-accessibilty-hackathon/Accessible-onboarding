// Sync engine (FB-7): flush the outbox when connectivity returns.
// Called on app start and when the browser fires the "online" event.

import { type ApiConfig, ApiError } from '../api/client';
import { saveAnswer } from '../api/registrations';
import { dequeueAll, clearSynced } from './outbox';

/**
 * Attempt to send every queued answer for `regId`.
 *
 * - On success the entry is removed from the outbox.
 * - On 409 (version conflict) `onConflict(stepId)` is called so the UI
 *   can alert the learner instead of silently overwriting.
 * - Other failures are counted but do not throw; the entry stays queued
 *   for the next sync attempt.
 */
export async function syncOutbox(
  cfg: ApiConfig,
  regId: string,
  onConflict: (stepId: string) => void,
): Promise<{ synced: number; failed: number }> {
  const entries = await dequeueAll(regId);

  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    try {
      await saveAnswer(cfg, regId, entry.stepId, entry.value, entry.inputMethod);
      await clearSynced(regId, entry.stepId);
      synced++;
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Conflict: another device / session saved a newer version.
        onConflict(entry.stepId);
        // Remove from outbox — the learner must decide what to do.
        await clearSynced(regId, entry.stepId);
        failed++;
      } else {
        // Network or server error — leave in queue for next attempt.
        failed++;
      }
    }
  }

  return { synced, failed };
}
