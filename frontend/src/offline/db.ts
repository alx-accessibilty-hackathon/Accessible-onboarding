import { createStore, type UseStore } from 'idb-keyval';

// One IndexedDB store for the widget: learner token + registration id (FB-3),
// the answers outbox (FB-7) and voice clips (FB-6). Opened on first use.
let store: UseStore | null = null;

export function widgetStore(): UseStore {
  store ??= createStore('bridge-onboarding', 'kv');
  return store;
}
