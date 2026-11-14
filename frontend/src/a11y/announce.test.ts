import { afterEach, describe, expect, it, vi } from 'vitest';
import { announce, registerLiveRegion } from './announce';

describe('announce', () => {
  afterEach(() => {
    registerLiveRegion(null);
    vi.useRealTimers();
  });

  it('writes the message into the live region', () => {
    vi.useFakeTimers();
    const region = document.createElement('div');
    registerLiveRegion(region);

    announce('Question 3 of 9');
    expect(region.textContent).toBe(''); // cleared first
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe('Question 3 of 9');
  });

  it('does nothing before a live region is registered', () => {
    expect(() => announce('Saved')).not.toThrow();
  });
});
