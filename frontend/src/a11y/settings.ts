// Settings the person chose on this device: language, Read aloud, Answer by speaking, text size
// and the cloud speech consent. Kept in localStorage; every access is wrapped because storage
// can be blocked (private mode), and then the settings simply last for this page only.

import { useSyncExternalStore, type CSSProperties } from 'react';

export type Setting = 'readAloud' | 'answerBySpeaking';

const KEYS: Record<Setting, string> = {
  readAloud: 'bo:read_aloud',
  answerBySpeaking: 'bo:answer_by_speaking',
};
// Read aloud is on until the person turns it off: we can't know at start-up whether someone
// can see the screen. (Nothing is said before their first key press or tap: speaker.ts.)
const DEFAULTS: Record<Setting, boolean> = {
  readAloud: true,
  answerBySpeaking: false,
};
const LANG_KEY = 'bo:lang';
const CONSENT_KEY = 'bo:speech_consent';
const TEXT_SIZE_KEY = 'bo:text_size';

/** Text sizes offered (percent of the normal size). */
export const TEXT_SIZES = [100, 150, 200, 300, 400] as const;

const memory = new Map<string, string | null>(); // used when storage is blocked
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null; // blocked
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    memory.set(key, value); // blocked: kept in memory for this page
  }
  listeners.forEach((l) => l());
}

export function getSetting(name: Setting): boolean {
  const value = read(KEYS[name]);
  if (value === null) return DEFAULTS[name];
  return value === '1';
}

export function setSetting(name: Setting, on: boolean): void {
  write(KEYS[name], on ? '1' : '0');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A setting as React state; it changes everywhere at once. */
export function useSetting(name: Setting): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSetting(name),
    () => DEFAULTS[name],
  );
}

/** The text size in percent (100 = normal), one of TEXT_SIZES. */
export function getTextSize(): number {
  const value = Number(read(TEXT_SIZE_KEY));
  return (TEXT_SIZES as readonly number[]).includes(value) ? value : 100;
}

export function setTextSize(percent: number): void {
  write(TEXT_SIZE_KEY, String(percent));
}

export function useTextSize(): number {
  return useSyncExternalStore(subscribe, getTextSize, () => 100);
}

/** The root's class for big text (200% and more): see .bo-large-text in styles.css. */
export function scaleClass(percent: number): string {
  return percent >= 200 ? ' bo-large-text' : '';
}

/** The text size as CSS variables for the root (styles.css): text and controls grow fully,
 * spacing at most 1.5 times, so a narrow screen keeps room for the words. */
export function scaleStyle(percent: number): CSSProperties {
  const scale = percent / 100;
  return {
    '--bo-scale': String(scale),
    '--bo-space-scale': String(Math.min(scale, 1.5)),
  } as CSSProperties;
}

/** The language the person chose on the language screen, if any. */
export function getChosenLanguage(): string | null {
  return read(LANG_KEY);
}

export function setChosenLanguage(lang: string): void {
  write(LANG_KEY, lang);
}

/** The cloud speech consent answer: true, false, or null when never asked. */
export function getSpeechConsent(): boolean | null {
  const value = read(CONSENT_KEY);
  return value === 'true' ? true : value === 'false' ? false : null;
}

export function setSpeechConsent(granted: boolean): void {
  write(CONSENT_KEY, granted ? 'true' : 'false');
}
