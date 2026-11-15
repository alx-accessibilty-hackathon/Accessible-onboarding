/**
 * WCAG 2.1 Color Contrast Utilities.
 * Enforces minimum 4.5:1 contrast against white (#ffffff) for Level AA compliance.
 */

/**
 * Parses a hex color string (#rgb, #rrggbb, rgb, rrggbb) into [r, g, b] (0-255).
 * Returns null if the hex string is invalid.
 */
export function parseHexColor(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB color.
 * Normalized to 0.0 for darkest black and 1.0 for lightest white.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const transform = (val: number) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = transform(r);
  const G = transform(g);
  const B = transform(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculates the contrast ratio of a hex color against white (#ffffff).
 * Contrast ratio formula: (L1 + 0.05) / (L2 + 0.05), where L1 >= L2.
 * Returns null if the hex color is invalid.
 */
export function contrastRatioAgainstWhite(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const lColor = relativeLuminance(rgb[0], rgb[1], rgb[2]);
  const lWhite = 1.0;
  return (lWhite + 0.05) / (lColor + 0.05);
}

/**
 * Checks whether a hex color meets the WCAG AA minimum contrast ratio (4.5:1) against white.
 */
export function isAccessibleAgainstWhite(hex: string, minRatio: number = 4.5): boolean {
  const ratio = contrastRatioAgainstWhite(hex);
  return ratio !== null && ratio >= minRatio;
}

/**
 * Darkens a hex color by a factor (e.g. 0.15 = 15% darker) for hover/active states.
 */
export function darkenHex(hex: string, factor: number = 0.15): string | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const multiplier = Math.max(0, 1 - factor);
  const r = Math.round(rgb[0] * multiplier);
  const g = Math.round(rgb[1] * multiplier);
  const b = Math.round(rgb[2] * multiplier);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
