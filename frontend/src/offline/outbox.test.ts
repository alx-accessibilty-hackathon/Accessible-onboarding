import { beforeEach, describe, expect, it } from 'vitest';
import { clearSynced, dequeueAll, enqueue, pendingCount } from './outbox';

describe('offline/outbox', () => {
  const regId = 'reg_test_123';

  beforeEach(async () => {
    // Clear outbox before each test
    const all = await dequeueAll(regId);
    for (const item of all) {
      await clearSynced(regId, item.stepId);
    }
  });

  it('enqueues an answer and tracks pending count', async () => {
    expect(await pendingCount(regId)).toBe(0);

    await enqueue(regId, 'full_name', 'Abebe Bikila', 'typed');
    expect(await pendingCount(regId)).toBe(1);

    const queued = await dequeueAll(regId);
    expect(queued).toHaveLength(1);
    expect(queued[0].stepId).toBe('full_name');
    expect(queued[0].value).toBe('Abebe Bikila');
    expect(queued[0].inputMethod).toBe('typed');
  });

  it('keeps only the latest value per step when enqueued multiple times', async () => {
    await enqueue(regId, 'phone', '0911000000', 'typed');
    await enqueue(regId, 'phone', '0912345678', 'voice');

    expect(await pendingCount(regId)).toBe(1);
    const queued = await dequeueAll(regId);
    expect(queued).toHaveLength(1);
    expect(queued[0].value).toBe('0912345678');
    expect(queued[0].inputMethod).toBe('voice');
  });

  it('clears synced step from outbox', async () => {
    await enqueue(regId, 'step_1', 'Answer 1', 'typed');
    await enqueue(regId, 'step_2', 'Answer 2', 'typed');
    expect(await pendingCount(regId)).toBe(2);

    await clearSynced(regId, 'step_1');
    expect(await pendingCount(regId)).toBe(1);

    const remaining = await dequeueAll(regId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].stepId).toBe('step_2');
  });
});
