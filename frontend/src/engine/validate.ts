import {
  ethiopianToGregorian,
  formatIsoDate,
  isValidEthiopianDate,
  type DateAnswerValue,
} from '../lib/ethiopianCalendar';
import { isValidEthiopianPhone } from '../lib/phone';
import type { Rule, Step } from './types';

export function isValueEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') {
    // If it's a date object
    const obj = val as Record<string, unknown>;
    if ('iso' in obj && !obj.iso) {
      // A date typed only in part (or one that doesn't exist) is not empty: it needs fixing.
      const entered = obj.entered as Record<string, unknown> | undefined;
      return !entered || Object.values(entered).every((v) => v === '' || v == null);
    }
    if (Object.keys(obj).length === 0) return true;
  }
  return false;
}

/** A short code question (e.g. the last 4 letters or numbers of a document): a text step that
 * must match a pattern. Its answer is spelled out when read, and spoken answers are cleaned
 * up as a code (no capital-letter names). */
export function isCodeStep(step: Step): boolean {
  return step.type === 'text' && !!step.validate?.some((r) => r.rule === 'pattern');
}

// A date of birth must be in the past; other dates (e.g. "When can you start?") may be ahead.
function mustBePast(step?: Step): boolean {
  return !step || step.id === 'dob' || (step.autocomplete ?? '').startsWith('bday');
}

export function validateRule(rule: Rule, value: unknown, step?: Step): string | null {
  if (isValueEmpty(value)) return null; // non-empty rules only apply if value is present

  const strVal = typeof value === 'string' ? value : String(value ?? '');

  switch (rule.rule) {
    case 'min_length': {
      const min = Number(rule.value);
      if (strVal.trim().length < min) {
        return rule.error || 'too_short';
      }
      break;
    }
    case 'max_length': {
      const max = Number(rule.value);
      if (strVal.length > max) {
        return rule.error || 'too_long';
      }
      break;
    }
    case 'digits': {
      const count = Number(rule.value);
      const digitsOnly = strVal.replace(/\D/g, '');
      if (digitsOnly.length !== count) {
        return rule.error || 'digits_invalid';
      }
      break;
    }
    case 'pattern': {
      if (rule.value) {
        const regex = new RegExp(String(rule.value));
        // The server trims text answers before it checks them: do the same.
        if (!regex.test(strVal.trim())) {
          return rule.error || 'pattern_invalid';
        }
      }
      break;
    }
    case 'phone_et': {
      if (!isValidEthiopianPhone(strVal)) {
        return rule.error || 'phone_invalid';
      }
      break;
    }
    case 'date_valid': {
      const code = dateError(value, !mustBePast(step));
      if (code) return code === 'date_invalid' ? rule.error || code : code;
      break;
    }
  }

  return null;
}

const MIN_DATE_YEAR = 1900;
const MAX_DATE_YEAR = 2100;

function gregorianDaysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The same date rules as the server (backend/Usecase/validate.go), so a wrong date is caught
 * on its own step: the ISO date is a real day between 1900 and 2100; an Ethiopian date exists
 * (months 1–12 have 30 days, Pagume 5, or 6 when year % 4 == 3) and is that same day; a date
 * of birth is not in the future. Returns an error code, or null when the date is fine.
 */
export function dateError(val: unknown, allowFuture = false): string | null {
  if (!val || typeof val !== 'object') return 'date_invalid';
  const date = val as Partial<DateAnswerValue> & { entered?: Record<string, unknown> };

  if (!date.iso) {
    const parts = Object.values(date.entered ?? {});
    const missing = parts.length < 3 || parts.some((v) => v === '' || v == null);
    return missing ? 'date_incomplete' : 'date_invalid';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.iso);
  if (!match) return 'date_invalid';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > gregorianDaysInMonth(y, m)) return 'date_invalid';
  if (y < MIN_DATE_YEAR || y > MAX_DATE_YEAR) return 'date_invalid';
  if (date.calendar && date.calendar !== 'ethiopian' && date.calendar !== 'gregorian') {
    return 'date_invalid';
  }
  if (date.calendar === 'ethiopian' && !date.ethiopian) return 'date_invalid';

  if (date.ethiopian) {
    const { year, month, day } = date.ethiopian;
    if (!isValidEthiopianDate(year, month, day)) return 'date_invalid';
    const g = ethiopianToGregorian(year, month, day);
    if (formatIsoDate(g.year, g.month, g.day) !== date.iso) return 'date_invalid';
  }

  if (!allowFuture) {
    const now = new Date();
    const today = formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (date.iso > today) return 'date_future';
  }
  return null;
}

export function validateDateValue(val: unknown, allowFuture = false): boolean {
  return dateError(val, allowFuture) === null;
}

export function validateStep(step: Step, value: unknown): string | null {
  // Required check
  if (step.required && isValueEmpty(value)) {
    return 'required';
  }

  // If empty and not required, valid
  if (isValueEmpty(value)) {
    return null;
  }

  // Validate rules if defined
  if (step.validate && step.validate.length > 0) {
    for (const rule of step.validate) {
      const error = validateRule(rule, value, step);
      if (error) return error;
    }
  }

  // A date is always checked, even on a step without a date_valid rule: the server would refuse it.
  if (step.type === 'date' && !step.validate?.some((r) => r.rule === 'date_valid')) {
    return dateError(value, !mustBePast(step));
  }

  return null;
}
