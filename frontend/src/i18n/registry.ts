// The language registry: every locales/<code>.json file is a language. Adding a file (and the
// code in the partner's `languages` config) adds the language; see README "Adding a language".
// Keys missing from a file fall back to English in t().

const files = import.meta.glob<Record<string, string>>('./locales/*.json', {
  eager: true,
  import: 'default',
});

export const packs: Record<string, Record<string, string>> = {};
for (const [file, pack] of Object.entries(files)) {
  const code = /([\w-]+)\.json$/.exec(file)?.[1];
  if (code) packs[code] = pack;
}

/** Every language with a locale file, Amharic first, then the rest by code. */
export const LANGUAGES: string[] = Object.keys(packs).sort((a, b) =>
  a === 'am' ? -1 : b === 'am' ? 1 : a.localeCompare(b),
);

export function hasLanguage(code: string): boolean {
  return code in packs;
}

/** The languages to offer: the partner's list (GET /config) that we have files for, else all. */
export function offeredLanguages(configured?: string[] | null): string[] {
  const list = (configured ?? []).filter(hasLanguage);
  return list.length > 0 ? Array.from(new Set(list)) : LANGUAGES;
}

/** The language's name in its own script ("አማርኛ", "English"), from its own locale file. */
export function languageName(code: string): string {
  return packs[code]?.['language.name'] ?? code;
}

/** BCP-47 tag for speech recognition and voices (am → am-ET), from the locale file. */
export function speechTag(code: string): string {
  return packs[code]?.['language.speech_tag'] ?? code;
}
