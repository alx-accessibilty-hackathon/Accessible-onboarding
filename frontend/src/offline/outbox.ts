// Outbox: queue un-sent answers when offline (FB-7).
// Keeps only the *latest* value per step so the queue stays tiny.
// Stored in IndexedDB via widgetStore().

import { get, set } from 'idb-keyval';
import { widgetStore } from './db';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OutboxEntry {
  stepId: string;
  value: unknown;
  inputMethod: string;
  queuedAt: number; // Date.now()
}

// Internal shape: one record per registration, keyed by stepId.
type OutboxMap = Record<string, OutboxEntry>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function outboxKey(regId: string): string {
  return `outbox:${regId}`;
}

async function load(regId: string): Promise<OutboxMap> {
  return (await get<OutboxMap>(outboxKey(regId), widgetStore())) ?? {};
}

async function save(regId: string, map: OutboxMap): Promise<void> {
  await set(outboxKey(regId), map, widgetStore());
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Queue an answer for later sync. If an entry for the same step already
 * exists it is silently replaced (only the latest value matters).
 */
export async function enqueue(
  regId: string,
  stepId: string,
  value: unknown,
  inputMethod: string,
): Promise<void> {
  const map = await load(regId);
  map[stepId] = { stepId, value, inputMethod, queuedAt: Date.now() };
  await save(regId, map);
}

/** Return all pending entries for a registration. */
export async function dequeueAll(regId: string): Promise<OutboxEntry[]> {
  const map = await load(regId);
  return Object.values(map);
}

/** Remove a single step from the outbox after it has been synced. */
export async function clearSynced(
  regId: string,
  stepId: string,
): Promise<void> {
  const map = await load(regId);
  delete map[stepId];
  await save(regId, map);
}

/** How many answers are waiting to be sent? */
export async function pendingCount(regId: string): Promise<number> {
  const map = await load(regId);
  return Object.keys(map).length;
}
