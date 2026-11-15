import type { Step } from '../engine/types';
import { isCodeStep } from '../engine/validate';

// Filler words to strip (English + Amharic)
const FILLER_EN = /\b(um|uh|uh+m|ah|er|like|you know)\b/gi;
// For Amharic Unicode characters, \b doesn't match word boundaries, so use whitespace/boundary anchors
const FILLER_AM = /(?:^|\s)(እምም|አምም|እ+ም|አ+ም|እ)(?=\s|$)/gu;

// English spoken digits → numeric character
const ENGLISH_DIGITS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

// Amharic spoken digits → numeric character
const AMHARIC_DIGITS: Record<string, string> = {
  ዜሮ: '0',
  አንድ: '1',
  ሁለት: '2',
  ሦስት: '3',
  ሶስት: '3',
  አራት: '4',
  አምስት: '5',
  ስድስት: '6',
  ሰባት: '7',
  ስምንት: '8',
  ዘጠኝ: '9',
};

// Ethiopic numeral characters → digits
const ETHIOPIC_NUMERALS: Record<string, string> = {
  '፩': '1',
  '፪': '2',
  '፫': '3',
  '፬': '4',
  '፭': '5',
  '፮': '6',
  '፯': '7',
  '፰': '8',
  '፱': '9',
  '፲': '10',
};

// Ethiopian month names in Amharic and English spelling
export const ETHIOPIAN_MONTHS: Record<string, number> = {
  // Amharic
  መስከረም: 1,
  ጥቅምት: 2,
  ኅዳር: 3,
  ህዳር: 3,
  ታኅሣሥ: 4,
  ታህሳስ: 4,
  ጥር: 5,
  የካቲት: 6,
  መጋቢት: 7,
  ሚያዝያ: 8,
  ግንቦት: 9,
  ሰኔ: 10,
  ሐምሌ: 11,
  ሀምሌ: 11,
  ነሐሴ: 12,
  ነሀሴ: 12,
  ጳጉሜን: 13,
  ጳጉሜ: 13,
  // English spelling
  meskerem: 1,
  tikimt: 2,
  hidar: 3,
  tahsas: 4,
  tir: 5,
  yekatit: 6,
  megabit: 7,
  miyazya: 8,
  ginbot: 9,
  sene: 10,
  hamle: 11,
  nehase: 12,
  pagume: 13,
};

/** Remove filler words based on language. */
export function stripFiller(text: string, lang: string): string {
  let out = text;
  if (lang === 'en') {
    out = out.replace(FILLER_EN, ' ');
  } else if (lang === 'am') {
    out = out.replace(FILLER_AM, ' ');
  }
  // Also strip fillers from the other language for bilingual users
  out = out.replace(FILLER_EN, ' ').replace(FILLER_AM, ' ');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Capitalize first letter of each word (for Latin names). */
function capitalizeName(text: string): string {
  return text.toLowerCase().replace(/(?:^|\s)\S/g, (ch) => ch.toUpperCase());
}

/** Normalize name: remove lead-ins like "my name is", "I am", "ስሜ" and trailing "ነው". */
export function normalizeName(text: string, lang: string): string {
  let cleaned = stripFiller(text, lang);

  // Amharic lead-in "ስሜ" and trailing "ነው"
  // e.g. "ስሜ አበበ ከበደ ነው" -> "አበበ ከበደ"
  cleaned = cleaned.replace(/^ስሜ\s+/iu, '');
  cleaned = cleaned.replace(/\s+ነው$/iu, '');

  // English lead-ins: "my name is", "i am", "it's", "it is"
  cleaned = cleaned.replace(/^(my name is|i am|it's|it is)\s+/i, '');

  cleaned = cleaned.trim();

  // If Latin text, capitalize words
  if (/^[a-zA-Z\s'-]+$/.test(cleaned)) {
    return capitalizeName(cleaned);
  }

  return cleaned;
}

/** Replace Ethiopic numeral characters with ASCII digits. */
export function replaceEthiopicNumerals(text: string): string {
  let out = text;
  for (const [eth, digit] of Object.entries(ETHIOPIC_NUMERALS)) {
    out = out.split(eth).join(digit);
  }
  return out;
}

/** Convert spoken digit words (Amharic and English) to numeric characters. */
export function spokenDigitsToNumeric(text: string, _lang?: string): string {
  void _lang;
  let out = text;

  // Replace Ethiopic numerals first
  out = replaceEthiopicNumerals(out);

  // Replace Amharic spoken digit words
  for (const [word, digit] of Object.entries(AMHARIC_DIGITS)) {
    out = out.split(word).join(digit);
  }

  // Replace English spoken digit words (case-insensitive)
  for (const [word, digit] of Object.entries(ENGLISH_DIGITS)) {
    out = out.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit);
  }

  // Collapse single isolated digits separated by space: "0 9 1 1" -> "0911"
  // Repeat to handle arbitrarily long digit sequences
  while (/(?<=\b\d)\s+(?=\d\b)/.test(out)) {
    out = out.replace(/(?<=\b\d)\s+(?=\d\b)/g, '');
  }

  return out.trim();
}

/**
 * Normalize phone number:
 * - Turn digit words and Ethiopic numerals into digits.
 * - Find every sequence of Ethiopian phone numbers: 09..., 07..., 2519..., 2517...
 * - Keeps the LAST full 10-digit or 12-digit match (handles spoken self-correction).
 * - Formats as `09xx xxx xxx` for display.
 */
export function normalizePhone(text: string, lang: string): string {
  const converted = spokenDigitsToNumeric(text, lang);

  // Find all sequences that look like phone numbers in the text
  // Matches: 09..., 07..., +2519..., +2517... or sequences of 10 digits starting with 0[79]
  const pattern = /(?:\+?251|0)?([79]\d{8})\b/g;
  const matches = Array.from(converted.matchAll(pattern));

  if (matches.length > 0) {
    // Keep the LAST match (handles spoken self-correction)
    const lastMatch = matches[matches.length - 1];
    const nineDigits = lastMatch[1]; // e.g. "912345678"
    return `0${nineDigits.slice(0, 3)} ${nineDigits.slice(3, 6)} ${nineDigits.slice(6)}`;
  }

  // If no standard 9-digit match found, extract digits from the last continuous digit cluster
  const digitClusters = converted.match(/\d+/g);
  if (digitClusters && digitClusters.length > 0) {
    const lastCluster = digitClusters[digitClusters.length - 1];
    if (
      lastCluster.length === 10 &&
      (lastCluster.startsWith('09') || lastCluster.startsWith('07'))
    ) {
      return `${lastCluster.slice(0, 4)} ${lastCluster.slice(4, 7)} ${lastCluster.slice(7)}`;
    }
    return lastCluster;
  }

  return converted;
}

/**
 * Normalize last-4 ID digits:
 * Keep the LAST 4 digits heard (handles "it ends in 4 8 2 1" or self-correction).
 */
export function normalizeDigits(text: string, lang: string): string {
  const converted = spokenDigitsToNumeric(text, lang);
  const digits = converted.replace(/\D/g, '');

  if (digits.length >= 4) {
    return digits.slice(-4);
  }

  return digits;
}

/**
 * Normalize a short code (the last 4 letters or numbers of a document, e.g. "AB12"):
 * digit words become digits, spaces and punctuation go, letters become capitals, and the
 * LAST 4 letters or numbers heard are kept (handles "it ends in A B 1 2" or self-correction).
 */
export function normalizeCode(text: string, lang: string, length = 4): string {
  const converted = spokenDigitsToNumeric(text, lang);
  // Single letters said one by one ("a b 1 2"), or the code said as one word ("ab12").
  const words = converted.split(/\s+/).filter(Boolean);
  const singles = words.filter((w) => /^[0-9A-Za-z]$/.test(w));
  const source = singles.length >= Math.min(length, words.length) ? singles.join('') : converted;
  const code = source.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return code.length > length ? code.slice(-length) : code;
}

/**
 * Normalize spoken date:
 * Finds day number (1-30), month name (Ethiopian or Gregorian), 4-digit year.
 */
export function normalizeDate(text: string, lang: string): string {
  const cleaned = stripFiller(text, lang);
  const numeric = spokenDigitsToNumeric(cleaned, lang);

  // Look for 4-digit year (e.g. 1990 - 2026)
  const yearMatch = numeric.match(/\b(19\d{2}|20\d{2})\b/);
  // Look for day (1 to 30) - ensure not part of the 4-digit year
  const dayMatch = numeric.match(/\b([1-9]|[12]\d|30)\b(?!\d{2})/);

  // Look for month name in text
  let foundMonth: string | null = null;
  const lower = cleaned.toLowerCase();
  for (const monthName of Object.keys(ETHIOPIAN_MONTHS)) {
    if (lower.includes(monthName)) {
      foundMonth = monthName;
      break;
    }
  }

  const parts: string[] = [];
  if (dayMatch) parts.push(dayMatch[1]);
  if (foundMonth) parts.push(foundMonth);
  if (yearMatch) parts.push(yearMatch[1]);

  return parts.length > 0 ? parts.join(' ') : numeric;
}

/**
 * Match single choice:
 * Match option label, value, say words, or spoken index number ("1", "one", "አንድ", etc.).
 */
export function matchSingleChoice(raw: string, step: Step, lang: string): string | null {
  const options = step.options;
  if (!options?.length) return null;

  const cleaned = stripFiller(raw, lang).toLowerCase().trim();
  const digitsText = spokenDigitsToNumeric(cleaned, lang);

  // Check if a number was spoken representing an option index (1-based: "1", "2"...)
  const numMatch = digitsText.match(/\b(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return options[idx].value;
    }
  }

  // Exact match on value or label
  for (const opt of options) {
    if (opt.value.toLowerCase() === cleaned || opt.label.toLowerCase() === cleaned) {
      return opt.value;
    }
    if (opt.say?.some((s) => s.toLowerCase() === cleaned)) {
      return opt.value;
    }
  }

  // Substring match: check if spoken text contains label or say words
  const matchedOpts: string[] = [];
  for (const opt of options) {
    const labelLower = opt.label.toLowerCase();
    if (cleaned.includes(labelLower)) {
      matchedOpts.push(opt.value);
    } else if (opt.say?.some((s) => cleaned.includes(s.toLowerCase()))) {
      matchedOpts.push(opt.value);
    }
  }

  // If exactly one option matched, return it
  if (matchedOpts.length === 1) {
    return matchedOpts[0];
  }

  return null;
}

/** Lower case, no punctuation (Latin or Ethiopic), single spaces: for comparing spoken words. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()"'«»\-–—/።፣፤፥፦፧]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match what was said to one option of a single-choice question, using the labels as they are
 * shown in the current language (and the partner names, for "Which organisation…"), the
 * flow's `say` words, or the option's number ("2", "two", "ሁለት"). Returns the option value,
 * or null when nothing (or more than one option) matches: then we ask again (section 3.6).
 */
export function matchChoice(
  raw: string,
  choices: Array<{ value: string; label: string; say?: string[] }>,
  lang: string,
): string | null {
  if (choices.length === 0) return null;
  const said = plain(stripFiller(raw, lang));
  if (!said) return null;

  // Exact label or say word
  for (const c of choices) {
    if (plain(c.label) === said || c.say?.some((s) => plain(s) === said)) return c.value;
  }

  // A number on its own ("2", "two", "ሁለት", "number 2"): the second option
  const digits = spokenDigitsToNumeric(said, lang).match(/^(?:\D*\s)?(\d{1,2})$/);
  if (digits) {
    const idx = Number(digits[1]) - 1;
    if (idx >= 0 && idx < choices.length) return choices[idx].value;
  }

  // The label (or a say word) inside what was said, or what was said inside the label
  const words = ` ${said} `;
  const found = new Set<string>();
  for (const c of choices) {
    const label = plain(c.label);
    if (
      (label && words.includes(` ${label} `)) ||
      (said.length >= 3 && ` ${label} `.includes(` ${said} `)) ||
      c.say?.some((s) => {
        const w = plain(s);
        return w.length >= 2 && words.includes(` ${w} `);
      })
    ) {
      found.add(c.value);
    }
  }
  return found.size === 1 ? Array.from(found)[0] : null;
}

/**
 * Match multi choice:
 * Returns array of matched option values.
 */
export function matchMultiChoice(raw: string, step: Step, lang: string): string[] {
  const options = step.options;
  if (!options?.length) return [];

  const cleaned = stripFiller(raw, lang).toLowerCase().trim();
  const digitsText = spokenDigitsToNumeric(cleaned, lang);
  const matched = new Set<string>();

  // Check spoken numbers
  const numMatches = digitsText.matchAll(/\b(\d+)\b/g);
  for (const m of numMatches) {
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0 && idx < options.length) {
      matched.add(options[idx].value);
    }
  }

  // Check labels and say words
  for (const opt of options) {
    const labelLower = opt.label.toLowerCase();
    if (cleaned.includes(labelLower)) {
      matched.add(opt.value);
    } else if (opt.say?.some((s) => cleaned.includes(s.toLowerCase()))) {
      matched.add(opt.value);
    }
  }

  return Array.from(matched);
}

/**
 * Main normalizeVoiceInput entry point.
 * Pure function: deterministic field-specific rules (no generative model).
 */
export function normalizeVoiceInput(raw: string, step: Step, lang: string): string | string[] {
  const cleaned = stripFiller(raw, lang);

  switch (step.type) {
    case 'text':
      // A code question ("the last 4 letters or numbers"), not a name.
      if (isCodeStep(step)) return normalizeCode(cleaned, lang);
      return normalizeName(cleaned, lang);

    case 'phone':
      return normalizePhone(cleaned, lang);

    case 'digits':
      return normalizeDigits(cleaned, lang);

    case 'date':
      return normalizeDate(cleaned, lang);

    case 'single_choice': {
      const matched = matchSingleChoice(cleaned, step, lang);
      return matched ?? cleaned;
    }

    case 'multi_choice': {
      const matched = matchMultiChoice(cleaned, step, lang);
      return matched.length > 0 ? matched : [cleaned];
    }

    case 'long_text': {
      if (cleaned.length === 0) return cleaned;
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    default:
      return cleaned;
  }
}
