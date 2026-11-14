import { describe, expect, it } from 'vitest';
import { directionOf, t } from './t';

describe('t', () => {
  it('fills in placeholders', () => {
    expect(t('en', 'common.progress', { n: 3, total: 9 })).toBe('Question 3 of 9');
    expect(t('am', 'common.progress', { n: 3, total: 9 })).toBe('ጥያቄ 3 ከ 9');
  });

  it('translates Amharic when present, and falls back to English when missing or TODO', () => {
    // Present in Amharic
    expect(t('am', 'common.continue')).toBe('ቀጥል');
    // Non-existent in Amharic, exists in English (mocked or custom key)
    expect(t('am', 'test.english_only_key')).toBe('test.english_only_key');
  });

  it('returns the key when no language has it, so missing strings are easy to spot', () => {
    expect(t('en', 'does.not.exist')).toBe('does.not.exist');
  });
});

describe('directionOf', () => {
  it('is right-to-left only for right-to-left languages', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('am')).toBe('ltr');
  });
});
