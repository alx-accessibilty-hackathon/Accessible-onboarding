import am from './locales/am.json';
import en from './locales/en.json';

// One flat JSON file per language. Adding a language = add locales/<code>.json (+ public/audio/<code>/)
// and register it here. Values starting with "TODO-am" (or any "TODO-") count as missing.
const packs: Record<string, Record<string, string>> = { en, am };

const RTL_LANGUAGES = ['ar'];

export function t(lang: string, key: string, params: Record<string, string | number> = {}): string {
  const pack = packs[lang];
  const own = pack?.[key];

  let raw: string;
  if (own && !own.startsWith('TODO-')) {
    raw = own;
  } else {
    // Missing or unfinished translation: fallback to English
    if (lang !== 'en' && typeof console !== 'undefined' && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing translation for key "${key}" in language "${lang}", falling back to English.`);
    }
    raw = packs.en[key] ?? key;
  }

  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

export function directionOf(lang: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}
