import { isValidEthiopianDate } from '../lib/ethiopianCalendar';
import { isValidEthiopianPhone } from '../lib/phone';
import type { Rule, Step } from './types';

export function isValueEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') {
    // If it's a date object
    const obj = val as Record<string, unknown>;
    if ('iso' in obj && !obj.iso) return true;
    if (Object.keys(obj).length === 0) return true;
  }
  return false;
}

export function validateRule(rule: Rule, value: unknown): string | null {
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
        if (!regex.test(strVal)) {
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
      if (!validateDateValue(value)) {
        return rule.error || 'date_invalid';
      }
      break;
    }
  }

  return null;
}

export function validateDateValue(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  const dateObj = val as {
    calendar?: string;
    ethiopian?: { year: number; month: number; day: number };
    iso?: string;
  };

  if (!dateObj.iso) return false;

  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateObj.iso)) return false;

  const parsed = new Date(dateObj.iso);
  if (isNaN(parsed.getTime())) return false;

  // Must be in the past
  const now = new Date();
  if (parsed > now) return false;

  // Year check: reasonable human age (e.g., between 1900 and current year)
  const gYear = parsed.getUTCFullYear();
  if (gYear < 1900 || gYear > now.getUTCFullYear()) return false;

  if (dateObj.calendar === 'ethiopian' && dateObj.ethiopian) {
    const { year, month, day } = dateObj.ethiopian;
    if (!isValidEthiopianDate(year, month, day)) return false;
  }

  return true;
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
      const error = validateRule(rule, value);
      if (error) return error;
    }
  }

  return null;
}
