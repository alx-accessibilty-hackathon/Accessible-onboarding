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

// Numbers said in groups, as people say phone numbers ("09 11 22…" = "ዜሮ ዘጠኝ አስራ አንድ ሃያ
// ሁለት…"): the tens and hundreds words. Speech services (Addis AI) write them as words.
const AMHARIC_TENS: Record<string, number> = {
  አስር: 10,
  አስራ: 10,
  ሃያ: 20,
  ሀያ: 20,
  ሐያ: 20,
  ሰላሳ: 30,
  ሠላሳ: 30,
  ሰላሣ: 30,
  አርባ: 40,
  ሃምሳ: 50,
  ሀምሳ: 50,
  ሐምሳ: 50,
  ስልሳ: 60,
  ስድሳ: 60,
  ስልሣ: 60,
  ሰባ: 70,
  ሰማንያ: 80,
  ሰማኒያ: 80,
  ዘጠና: 90,
};
const ENGLISH_TENS: Record<string, number> = {
  ten: 10,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const ENGLISH_TEENS: Record<string, number> = {
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const HUNDRED = new Set(['መቶ', 'hundred']);

/**
 * The digits in what was said, as runs: a run is a number said without other words in it
 * (spaces and punctuation such as "፣" or "-" between digits don't end it; another word, such as
 * "no", does). Digit words, tens and hundreds become digits: "ዜሮ ዘጠኝ አስራ አንድ ሃያ ሁለት" →
 * "091122", "አንድ መቶ ሁለት" → "102", "double five" → "55", "09 11 22" → "091122".
 */
export function spokenDigitRuns(text: string): string[] {
  const tokens =
    replaceEthiopicNumerals(text)
      .toLowerCase()
      .match(/[0-9]+|[\p{L}\p{M}]+|[^\s\p{L}\p{M}0-9]/gu) ?? [];
  const runs: string[] = [];
  let run = '';
  // A number being said in words: its value so far, and which parts it has.
  let value: number | null = null;
  let hasHundreds = false;
  let hasTens = false;
  let repeat = 1;

  const flush = () => {
    if (value !== null) run += String(value);
    value = null;
    hasHundreds = false;
    hasTens = false;
  };
  const endRun = () => {
    flush();
    if (run) runs.push(run);
    run = '';
    repeat = 1;
  };

  for (const tok of tokens) {
    if (/^[0-9]+$/.test(tok)) {
      flush();
      run += tok.length === 1 ? tok.repeat(repeat) : tok;
      repeat = 1;
      continue;
    }
    const unitWord = AMHARIC_DIGITS[tok] ?? ENGLISH_DIGITS[tok];
    if (unitWord !== undefined) {
      const unit = Number(unitWord);
      if (value !== null && (hasTens || hasHundreds) && value % 10 === 0) {
        value += unit; // "ሃያ ሁለት" = 22, "አንድ መቶ ሁለት" = 102
        flush();
      } else {
        flush();
        if (repeat > 1) {
          run += unitWord.repeat(repeat);
          repeat = 1;
        } else {
          value = unit; // may be "ሁለት" of "ሁለት መቶ"
        }
      }
      continue;
    }
    if (HUNDRED.has(tok)) {
      value = (value !== null && !hasTens && !hasHundreds ? value : 1) * 100;
      hasHundreds = true;
      continue;
    }
    const tens = AMHARIC_TENS[tok] ?? ENGLISH_TENS[tok];
    if (tens !== undefined) {
      if (value !== null && hasHundreds && !hasTens && value % 100 === 0) {
        value += tens; // "አንድ መቶ ሃያ" = 120
      } else {
        flush();
        value = tens;
      }
      hasTens = true;
      continue;
    }
    if (ENGLISH_TEENS[tok] !== undefined) {
      flush();
      run += String(ENGLISH_TEENS[tok]);
      continue;
    }
    if (tok === 'double' || tok === 'triple') {
      flush();
      repeat = tok === 'double' ? 2 : 3;
      continue;
    }
    if (/^[\p{L}\p{M}]+$/u.test(tok)) {
      endRun(); // another word ("no", "my number is"): what follows is another number
      continue;
    }
    flush(); // punctuation between digits ("፣", ",", "-", "+"): the same number goes on
  }
  endRun();
  return runs;
}

/** An Ethiopian mobile number ending a run of digits: 09…, 07…, 2519…, 2517… */
const PHONE_IN_DIGITS = /(?:251|0)?([79]\d{8})(?!\d)/g;

function lastPhoneIn(digits: string): string | null {
  const found = Array.from(digits.matchAll(PHONE_IN_DIGITS));
  return found.length ? found[found.length - 1][1] : null;
}

/**
 * Normalize phone number:
 * - Turn digit words, tens and hundreds ("ሃያ ሁለት"), and Ethiopic numerals into digits, said
 *   one by one or in groups.
 * - Keeps the LAST full number said (handles "0911…, no, 0912…").
 * - Formats as `09xx xxx xxx`. If no full number was heard, every digit heard is kept (never
 *   only the last group), so the person can correct it.
 */
export function normalizePhone(text: string, lang: string): string {
  void lang;
  const runs = spokenDigitRuns(text);
  const format = (nine: string) => `0${nine.slice(0, 3)} ${nine.slice(3, 6)} ${nine.slice(6)}`;
  for (let i = runs.length - 1; i >= 0; i--) {
    const nine = lastPhoneIn(runs[i]);
    if (nine) return format(nine);
  }
  // A word in the middle of the number ("ዜሮ ዘጠኝ … እና …"): all the digits together.
  const all = runs.join('');
  const nine = lastPhoneIn(all);
  if (nine) return format(nine);
  return all || text.trim();
}

/**
 * Normalize last-4 ID digits:
 * Keep the LAST 4 digits heard (handles "it ends in 4 8 2 1", "አርባ ስምንት ሃያ አንድ" or
 * self-correction).
 */
export function normalizeDigits(text: string, lang: string): string {
  void lang;
  const digits = spokenDigitRuns(text).join('');

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
