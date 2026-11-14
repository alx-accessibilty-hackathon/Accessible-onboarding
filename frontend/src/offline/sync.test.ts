import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import * as regApi from '../api/registrations';
import { clearSynced, dequeueAll, enqueue } from './outbox';
import { syncOutbox } from './sync';

describe('offline/sync', () => {
  const cfg = { origin: '', partnerKey: 'pk_test' };
  const regId = 'reg_sync_test';

  beforeEach(async () => {
    vi.restoreAllMocks();
    const all = await dequeueAll(regId);
    for (const item of all) {
      await clearSynced(regId, item.stepId);
    }
  });

  it('syncs all queued answers and removes synced items from outbox', async () => {
    await enqueue(regId, 'full_name', 'Abebe', 'typed');
    await enqueue(regId, 'phone', '0912345678', 'typed');

    const saveSpy = vi
      .spyOn(regApi, 'saveAnswer')
      .mockResolvedValue({ version: 1 } as regApi.Answer);
    const onConflict = vi.fn();

    const result = await syncOutbox(cfg, regId, onConflict);

    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(onConflict).not.toHaveBeenCalled();

    const remaining = await dequeueAll(regId);
    expect(remaining).toHaveLength(0);
  });

  it('calls onConflict and removes item from outbox on HTTP 409 conflict', async () => {
    await enqueue(regId, 'full_name', 'Conflicted Answer', 'typed');

    vi.spyOn(regApi, 'saveAnswer').mockRejectedValue(new ApiError(409, 'answer_conflict'));
    const onConflict = vi.fn();

    const result = await syncOutbox(cfg, regId, onConflict);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(onConflict).toHaveBeenCalledWith('full_name');

    const remaining = await dequeueAll(regId);
    expect(remaining).toHaveLength(0);
  });

  it('leaves item in queue if a network error occurs', async () => {
    await enqueue(regId, 'full_name', 'Offline Answer', 'typed');

    vi.spyOn(regApi, 'saveAnswer').mockRejectedValue(new ApiError(0, 'network'));
    const onConflict = vi.fn();

    const result = await syncOutbox(cfg, regId, onConflict);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(onConflict).not.toHaveBeenCalled();

    const remaining = await dequeueAll(regId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].value).toBe('Offline Answer');
  });
});
