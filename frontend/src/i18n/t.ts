import am from './locales/am.json';
import en from './locales/en.json';

// One flat JSON file per language. Adding a language = add locales/<code>.json (+ public/audio/<code>/)
// and register it here. Values starting with "TODO-am" (or any "TODO-") count as missing.
const packs: Record<string, Record<string, string>> = { en, am };

const RTL_LANGUAGES = ['ar'];

export function t(lang: string, key: string, params: Record<string, string | number> = {}): string {
  const own = packs[lang]?.[key];
  const raw = own && !own.startsWith('TODO-') ? own : (packs.en[key] ?? key);
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

export function directionOf(lang: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}
