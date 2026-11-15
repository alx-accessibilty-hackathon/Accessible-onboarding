import { describe, expect, it } from 'vitest';
import {
  contrastRatioAgainstWhite,
  darkenHex,
  isAccessibleAgainstWhite,
  parseHexColor,
  relativeLuminance,
} from './color';

describe('color utilities', () => {
  describe('parseHexColor', () => {
    it('parses 6-digit hex colors with and without hash', () => {
      expect(parseHexColor('#ffffff')).toEqual([255, 255, 255]);
      expect(parseHexColor('ffffff')).toEqual([255, 255, 255]);
      expect(parseHexColor('#000000')).toEqual([0, 0, 0]);
      expect(parseHexColor('#cc3636')).toEqual([204, 54, 54]);
    });

    it('parses 3-digit shorthand hex colors', () => {
      expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
      expect(parseHexColor('000')).toEqual([0, 0, 0]);
      expect(parseHexColor('#f0a')).toEqual([255, 0, 170]);
    });

    it('returns null for invalid strings', () => {
      expect(parseHexColor('invalid')).toBeNull();
      expect(parseHexColor('#gggggg')).toBeNull();
      expect(parseHexColor('#12345')).toBeNull();
      expect(parseHexColor('')).toBeNull();
    });
  });

  describe('relativeLuminance', () => {
    it('calculates 1.0 for pure white and 0.0 for pure black', () => {
      expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1.0, 4);
      expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0.0, 4);
    });
  });

  describe('contrastRatioAgainstWhite', () => {
    it('calculates 1:1 for white against white', () => {
      expect(contrastRatioAgainstWhite('#ffffff')).toBeCloseTo(1.0, 2);
    });

    it('calculates 21:1 for black against white', () => {
      expect(contrastRatioAgainstWhite('#000000')).toBeCloseTo(21.0, 2);
    });

    it('returns null for invalid hex', () => {
      expect(contrastRatioAgainstWhite('not-a-color')).toBeNull();
      expect(contrastRatioAgainstWhite('#xyz')).toBeNull();
    });
  });

  describe('isAccessibleAgainstWhite', () => {
    it('passes default ALX red (#cc3636)', () => {
      // #cc3636 has a contrast ratio of ~4.65:1 against white
      expect(isAccessibleAgainstWhite('#cc3636')).toBe(true);
    });

    it('fails bright ALX red (#db3e3e) which was darkened because it is only 4.40:1', () => {
      expect(isAccessibleAgainstWhite('#db3e3e')).toBe(false);
    });

    it('passes high-contrast navy, dark green, and black', () => {
      expect(isAccessibleAgainstWhite('#1e3a8a')).toBe(true); // Navy
      expect(isAccessibleAgainstWhite('#065f46')).toBe(true); // Forest green
      expect(isAccessibleAgainstWhite('#000000')).toBe(true);
    });

    it('fails light colors like yellow, cyan, and light gray', () => {
      expect(isAccessibleAgainstWhite('#ffff00')).toBe(false); // Yellow
      expect(isAccessibleAgainstWhite('#00ffff')).toBe(false); // Cyan
      expect(isAccessibleAgainstWhite('#e5e7eb')).toBe(false); // Light gray
    });
  });

  describe('darkenHex', () => {
    it('darkens color by factor', () => {
      expect(darkenHex('#ffffff', 0.2)).toBe('#cccccc');
      expect(darkenHex('#000000', 0.2)).toBe('#000000');
      expect(darkenHex('#cc3636', 0.15)).toBe('#ad2e2e');
    });

    it('returns null for invalid hex', () => {
      expect(darkenHex('invalid')).toBeNull();
    });
  });
});
