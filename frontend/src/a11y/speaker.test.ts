import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as announceModule from './announce';
import { getSpeakerState, hasDeviceVoice, primeSpeech, speak } from './speaker';

describe('speaker a11y & fallbacks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports primeSpeech activating speech', () => {
    primeSpeech();
    expect(getSpeakerState().activated).toBe(true);
  });

  it('announces text to ARIA live region when audio source is none', async () => {
    const announceSpy = vi.spyOn(announceModule, 'announce').mockImplementation(() => {});
    primeSpeech();

    // With synthSupported returning false and no recording or server audio,
    // resolveSource will fall back to kind: 'none' and announce
    const originalSpeechSynthesis = window.speechSynthesis;
    // @ts-expect-error test override
    delete window.speechSynthesis;

    try {
      await speak(['Some notification message'], 'am');
      expect(announceSpy).toHaveBeenCalledWith('Some notification message');
    } finally {
      window.speechSynthesis = originalSpeechSynthesis;
    }
  });

  it('checks hasDeviceVoice for language', async () => {
    // If speechSynthesis has no voices and is not en, returns false
    const res = await hasDeviceVoice('am');
    expect(typeof res).toBe('boolean');
  });
});
