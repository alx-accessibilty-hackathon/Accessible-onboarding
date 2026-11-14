// "Saved on this phone": a copy of the sign-up answers and progress in IndexedDB, so a reload
// (even offline) comes back to the same step. Also the learner's ticked support needs, which
// pre-fill the jobs filter on this phone only (they are never sent with a jobs request).

import { get, set } from 'idb-keyval';
import type { AnswerState } from '../engine/types';
import { widgetStore } from './db';

export interface SignupSnapshot {
  currentStep: string;
  answers: Record<string, AnswerState>;
  consentPending?: boolean; // data_processing consent given, not yet sent
  supportDirty?: boolean; // support request changed, not yet sent
}

const SNAPSHOT_KEY = 'signup:snapshot';
const NEEDS_KEY = 'profile:needs';

export async function saveSnapshot(snapshot: SignupSnapshot): Promise<void> {
  await set(SNAPSHOT_KEY, snapshot, widgetStore());
}

export async function loadSnapshot(): Promise<SignupSnapshot | null> {
  return (await get<SignupSnapshot>(SNAPSHOT_KEY, widgetStore())) ?? null;
}

export async function saveNeeds(needs: string[]): Promise<void> {
  await set(NEEDS_KEY, needs, widgetStore());
}

export async function loadNeeds(): Promise<string[]> {
  const needs = await get<string[]>(NEEDS_KEY, widgetStore());
  return Array.isArray(needs) ? needs : [];
}
