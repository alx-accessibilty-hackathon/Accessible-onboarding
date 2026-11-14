// Outbox: queue un-sent answers (FB-7).
// Keeps only the *latest* value per step so the queue stays tiny, with the base_version it
// was written against. Stored in IndexedDB via widgetStore().

import { del, get, set } from 'idb-keyval';
import { widgetStore } from './db';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OutboxEntry {
  stepId: string;
  value: unknown;
  inputMethod: string;
  queuedAt: number; // Date.now()
  baseVersion?: number; // server version this value replaces (0 = nothing saved yet)
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
  baseVersion?: number,
): Promise<void> {
  const map = await load(regId);
  const queuedAt = Math.max(Date.now(), (map[stepId]?.queuedAt ?? 0) + 1);
  map[stepId] = { stepId, value, inputMethod, queuedAt, baseVersion };
  await save(regId, map);
}

/** Return all pending entries for a registration. */
export async function dequeueAll(regId: string): Promise<OutboxEntry[]> {
  const map = await load(regId);
  return Object.values(map);
}

/**
 * Remove a single step from the outbox after it has been synced. With `queuedAt`, only that
 * exact entry is removed: a newer value queued meanwhile stays. Returns whether it was removed.
 */
export async function clearSynced(
  regId: string,
  stepId: string,
  queuedAt?: number,
): Promise<boolean> {
  const map = await load(regId);
  const entry = map[stepId];
  if (!entry) return false;
  if (queuedAt !== undefined && entry.queuedAt !== queuedAt) return false;
  delete map[stepId];
  await save(regId, map);
  return true;
}

/** Move every queued answer from one key to another (answers given before the registration existed). */
export async function moveOutbox(fromRegId: string, toRegId: string): Promise<void> {
  const from = await load(fromRegId);
  if (Object.keys(from).length === 0) return;
  const to = await load(toRegId);
  await save(toRegId, { ...from, ...to });
  await del(outboxKey(fromRegId), widgetStore());
}

/** How many answers are waiting to be sent? */
export async function pendingCount(regId: string): Promise<number> {
  const map = await load(regId);
  return Object.keys(map).length;
}
