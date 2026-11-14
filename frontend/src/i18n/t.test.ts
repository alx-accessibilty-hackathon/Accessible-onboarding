import { describe, expect, it } from 'vitest';
import { directionOf, t } from './t';

describe('t', () => {
  it('fills in placeholders', () => {
    expect(t('en', 'common.progress', { n: 3, total: 9 })).toBe('Question 3 of 9');
  });

  it('falls back to English when the Amharic string is missing or TODO', () => {
    expect(t('am', 'common.continue')).toBe(t('en', 'common.continue'));
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
