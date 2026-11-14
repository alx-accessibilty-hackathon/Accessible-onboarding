import { describe, expect, it } from 'vitest';
import {
  formatEthiopianPhoneDisplay,
  isValidEthiopianPhone,
  normalizeEthiopianPhone,
} from './phone';

describe('Ethiopian phone validation and normalization', () => {
  it('accepts valid 09 numbers with various formats', () => {
    expect(isValidEthiopianPhone('0911234567')).toBe(true);
    expect(isValidEthiopianPhone('0911 234 567')).toBe(true);
    expect(isValidEthiopianPhone('0911-234-567')).toBe(true);
    expect(isValidEthiopianPhone('+251911234567')).toBe(true);
    expect(isValidEthiopianPhone('+251 911 234 567')).toBe(true);
  });

  it('accepts valid 07 numbers with various formats', () => {
    expect(isValidEthiopianPhone('0712345678')).toBe(true);
    expect(isValidEthiopianPhone('0712 345 678')).toBe(true);
    expect(isValidEthiopianPhone('+251712345678')).toBe(true);
  });

  it('rejects invalid numbers', () => {
    expect(isValidEthiopianPhone('')).toBe(false);
    expect(isValidEthiopianPhone('0811234567')).toBe(false); // starts with 08
    expect(isValidEthiopianPhone('091123456')).toBe(false); // too short
    expect(isValidEthiopianPhone('091123456789')).toBe(false); // too long
    expect(isValidEthiopianPhone('abc0911234567')).toBe(false);
  });

  it('normalizes to E.164 (+251...) format', () => {
    expect(normalizeEthiopianPhone('0911 234 567')).toBe('+251911234567');
    expect(normalizeEthiopianPhone('0712-345-678')).toBe('+251712345678');
    expect(normalizeEthiopianPhone('+251911234567')).toBe('+251911234567');
    expect(normalizeEthiopianPhone('invalid')).toBe(null);
  });

  it('formats for friendly display', () => {
    expect(formatEthiopianPhoneDisplay('+251911234567')).toBe('0911 234 567');
    expect(formatEthiopianPhoneDisplay('0712345678')).toBe('0712 345 678');
  });
});
