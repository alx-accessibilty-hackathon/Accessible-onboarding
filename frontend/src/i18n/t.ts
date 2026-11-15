import { packs } from './registry';

// One flat JSON file per language (locales/<code>.json, found by registry.ts). Values starting
// with "TODO-" count as missing: the English text shows instead.

const RTL_LANGUAGES = ['ar'];

export function t(lang: string, key: string, params: Record<string, string | number> = {}): string {
  const pack = packs[lang];
  const own = pack?.[key];

  let raw: string;
  if (own && !own.startsWith('TODO-')) {
    raw = own;
  } else {
    // Missing or unfinished translation: fallback to English
    if (
      lang !== 'en' &&
      typeof console !== 'undefined' &&
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV !== 'production'
    ) {
      console.warn(
        `[i18n] Missing translation for key "${key}" in language "${lang}", falling back to English.`,
      );
    }
    raw = packs.en?.[key] ?? key;
    // An API error code we have no words for: say something useful, never the raw code.
    if (raw === key && key.startsWith('errors.') && key !== 'errors.internal_error') {
      return t(lang, 'errors.internal_error');
    }
  }

  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/** The language-file key whose text is exactly `text` (for recorded clips of on-screen text). */
const reverse = new Map<string, Map<string, string>>();
export function keyForText(lang: string, text: string): string | undefined {
  let map = reverse.get(lang);
  if (!map) {
    map = new Map();
    for (const [key, value] of Object.entries(packs[lang] ?? {})) {
      if (!map.has(value)) map.set(value, key);
    }
    reverse.set(lang, map);
  }
  return map.get(text.trim());
}

export function directionOf(lang: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}
