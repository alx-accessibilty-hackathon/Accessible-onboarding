/**
 * Ethiopian phone number helpers.
 * Ethiopian mobile numbers start with 09 or 07 (or +251 9 / +251 7).
 * Local: 10 digits (e.g. 0911234567).
 * E.164 format: +251911234567 (13 characters).
 */

const ETHIOPIAN_PHONE_REGEX = /^(?:\+?251|0)?([79]\d{8})$/;

export function cleanPhoneInput(input: string): string {
  // Remove spaces, hyphens, parentheses, and dots
  return input.replace(/[\s\-().]/g, '');
}

export function isValidEthiopianPhone(input: string): boolean {
  if (!input) return false;
  const cleaned = cleanPhoneInput(input);
  return ETHIOPIAN_PHONE_REGEX.test(cleaned);
}

export function normalizeEthiopianPhone(input: string): string | null {
  if (!input) return null;
  const cleaned = cleanPhoneInput(input);
  const match = cleaned.match(ETHIOPIAN_PHONE_REGEX);
  if (!match) return null;
  const subscriberNumber = match[1]; // e.g. 911234567
  return `+251${subscriberNumber}`;
}

export function formatEthiopianPhoneDisplay(input: string): string {
  const normalized = normalizeEthiopianPhone(input);
  if (!normalized) return input;
  // normalized is +251912345678
  const subscriber = normalized.slice(4); // e.g. 912345678
  // display as 0912 345 678
  return `0${subscriber.slice(0, 3)} ${subscriber.slice(3, 6)} ${subscriber.slice(6)}`;
}
