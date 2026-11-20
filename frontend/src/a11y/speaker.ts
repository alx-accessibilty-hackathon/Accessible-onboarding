// The one speaker used everywhere (Read aloud mode, Listen buttons, focus speech, voice answers).
//
// Each part of what is said comes from the first source that can say it:
//   (a) a recorded clip <assetBase><lang>/<i18nKey>.mp3, when the text has a language-file key;
//   (b) the device's own voice for that language (speechSynthesis);
//   (c) the server voice, POST /speech/synthesis, for FIXED interface text only;
//   (d) nothing: we stay silent and say once (live region + a note near the toggle) that read
//       aloud isn't available in that language on this device yet.
// The learner's own words (`personal` parts) never leave the device (requirement Q2): they are
// read with the device voice only, or replaced by a fixed phrase.
// New speech cancels what is playing; the parts of one call play in order. Nothing plays before
// the person has interacted with the page (browsers block it, and it must never surprise anyone):
// a reading asked for earlier waits, and starts on their first key press, tap or click anywhere
// on the page (listened for on the document, capture phase, passive: the page is not changed).

import type { ApiConfig } from '../api/client';
import { ApiError } from '../api/client';
import { synthesize } from '../api/speech';
import { languageName, speechTag } from '../i18n/registry';
import { keyForText, t } from '../i18n/t';
import { announce } from './announce';

export interface SpeechPart {
  text: string;
  /** Language-file key, when `text` is exactly that string (a recorded clip may exist). */
  key?: string;
  /** The language of this part when it differs from the call's (e.g. "አማርኛ" on its own). */
  lang?: string;
  /** The learner's own words: device voice only; else `fallbackKey` is said (or nothing). */
  personal?: boolean;
  fallbackKey?: string;
}

/** A plain string is fixed interface text. */
export type Part = SpeechPart | string | null | undefined | false;

export interface SpeakOptions {
  /** Who is speaking (a screen, a dialog, a button): lets them stop only their own speech. */
  owner?: string;
  /** Focus and selection speech: never replaces a screen reading that waits for a first tap. */
  low?: boolean;
  /** Speak even while the microphone is listening (only for the "We heard" result). */
  force?: boolean;
  /** Wait for what is being said to finish (e.g. a new result count after "Checked …"). */
  after?: boolean;
  /** The person moved somewhere themselves (Tab, a tap): stop everything, including the first
   * screen reading and what waits for it, and say this now. */
  interrupt?: boolean;
}

export interface SpeakerState {
  speaking: boolean;
  owner: string | null;
  /** Languages read aloud couldn't speak in, on this device, in this session. */
  unavailable: string[];
  /** The person has pressed a key or tapped: the browser lets us play sound now. */
  activated: boolean;
}

interface Norm {
  text: string;
  key?: string;
  lang: string;
  personal?: boolean;
  fallbackKey?: string;
}

type Source =
  | { kind: 'audio'; url: string; lang: string }
  | { kind: 'device'; text: string; lang: string }
  | { kind: 'skip' }
  | { kind: 'none'; text: string; lang: string };

/* ------------------------------------------------------------------ */
/*  Configuration and state                                            */
/* ------------------------------------------------------------------ */

let api: ApiConfig | null = null;
let audioBase = '/audio/';

/** The API (for the server voice). Without a partner key the server voice is not used. */
export function configureSpeaker(cfg: ApiConfig | null): void {
  api = cfg && cfg.partnerKey ? cfg : null;
}

/** Where recorded clips live: next to the widget script, not on the host page. */
export function setAudioBase(url: string): void {
  audioBase = url.endsWith('/') ? url : `${url}/`;
}

let state: SpeakerState = {
  speaking: false,
  owner: null,
  unavailable: [],
  activated: browserActivated(),
};
const listeners = new Set<() => void>();
function setState(patch: Partial<SpeakerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function subscribeSpeaker(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSpeakerState(): SpeakerState {
  return state;
}

let generation = 0;
let held = false;
let deferredPending = false; // a reading waits for the first tap or key press
let finishCurrent: (() => void) | null = null;
let audioEl: HTMLAudioElement | null = null;
let utterance: SpeechSynthesisUtterance | null = null; // kept so the browser doesn't drop it
const idleWaiters: Array<() => void> = [];
const announced = new Set<string>();

// The screen reading that the first key press or tap started. Focus and selection speech that
// comes while it plays waits for it (the newest one wins), so the first Tab doesn't cut it off.
let firstReading = 0;
let queuedLow: { parts: Part[]; lang: string; opts: SpeakOptions } | null = null;

/* ------------------------------------------------------------------ */
/*  First user gesture                                                 */
/* ------------------------------------------------------------------ */

type UserActivation = { hasBeenActive: boolean; isActive: boolean };

function userActivation(): UserActivation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { userActivation?: UserActivation }).userActivation;
}

function browserActivated(): boolean {
  return userActivation()?.hasBeenActive === true;
}

let activated = false;
const gestureWaiters: Array<() => void> = [];
// Events that let a page play sound: a key, a mouse button, the start or end of a touch, or focus.
const GESTURE_EVENTS = [
  'keydown',
  'mousedown',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'click',
  'focusin',
] as const;
const LISTEN = { capture: true, passive: true } as const;

function onGesture(e?: Event): void {
  if (activated) return;
  // Some keys (Escape) don't count for the browser: wait for one that does.
  const ua = userActivation();
  if (
    ua &&
    !ua.hasBeenActive &&
    !ua.isActive &&
    e?.type !== 'focusin' &&
    e?.type !== 'pointerdown' &&
    e?.type !== 'touchstart'
  ) {
    return;
  }
  activated = true;
  GESTURE_EVENTS.forEach((type) => document.removeEventListener(type, onGesture, LISTEN));
  // Mobile Safari only lets speech start inside the gesture itself: unlock it now (only where
  // the page can speak at all; every browser with a speech engine also has audio).
  if (deferredPending && synthSupported()) primeSpeech();
  setState({ activated: true });
  gestureWaiters.splice(0).forEach((resolve) => resolve());
}

if (typeof document !== 'undefined') {
  GESTURE_EVENTS.forEach((type) => document.addEventListener(type, onGesture, LISTEN));
}

function hasActivation(): boolean {
  return activated || browserActivated();
}

/** Has the person pressed a key or tapped (so speech can play)? */
export function hasUserGesture(): boolean {
  return hasActivation();
}

function gestureReady(): Promise<void> {
  if (hasActivation()) return Promise.resolve();
  return new Promise((resolve) => gestureWaiters.push(resolve));
}

/** Resolves at the person's first key press or tap (at once if that already happened). */
export function whenActivated(): Promise<void> {
  return gestureReady();
}

// A tiny silent WAV: playing it lets mobile and desktop browsers test/unlock audio playback.
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

async function canAutoplay(): Promise<boolean> {
  if (hasActivation()) return true;
  if (typeof Audio === 'undefined') return false;
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false;
  try {
    const el = audioEl ?? (audioEl = new Audio());
    el.src = SILENCE;
    const played = el.play() as Promise<void> | undefined;
    if (played && typeof played.then === 'function') {
      await played;
    }
    activated = true;
    setState({ activated: true });
    gestureWaiters.splice(0).forEach((resolve) => resolve());
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Say these parts in order (cancelling anything else). Resolves true when all were played. */
export function speak(parts: Part[], lang: string, opts: SpeakOptions = {}): Promise<boolean> {
  if (held && !opts.force) return Promise.resolve(false);
  if (opts.interrupt) {
    firstReading = 0; // what is said now replaces the first reading; nothing waits for it
    queuedLow = null;
    opts = { ...opts, low: false, after: false };
  }
  if (opts.low && deferredPending) return Promise.resolve(false);
  if (opts.low && firstReading !== 0 && firstReading === generation && state.speaking) {
    queuedLow = { parts, lang, opts }; // said when the first reading is over
    return Promise.resolve(false);
  }
  if (opts.after && state.speaking) {
    const current = generation;
    // Only if nothing newer started meanwhile.
    return whenIdle().then(() =>
      current === generation ? speak(parts, lang, { ...opts, after: false }) : false,
    );
  }
  const list = normalize(parts, lang);
  const mine = ++generation;
  stopPlayback();
  if (list.length === 0) {
    deferredPending = false;
    setState({ speaking: false, owner: null });
    flushIdle();
    return Promise.resolve(true);
  }
  setState({ speaking: true, owner: opts.owner ?? null });
  return run(list, lang, mine).finally(() => {
    let next: typeof queuedLow = null;
    if (firstReading === mine) {
      firstReading = 0;
      next = queuedLow;
      queuedLow = null;
    }
    if (mine !== generation) return;
    setState({ speaking: false, owner: null });
    flushIdle();
    if (next) void speak(next.parts, next.lang, next.opts);
  });
}

/** Stop speaking (all of it, or only when `owner` is the one speaking). */
export function stopSpeaking(owner?: string): void {
  if (owner !== undefined && state.owner !== owner) return;
  // One reading stopped (e.g. the screen went away): what waited for it is said now.
  const next = owner !== undefined ? queuedLow : null;
  generation++;
  deferredPending = false;
  firstReading = 0;
  queuedLow = null;
  stopPlayback();
  if (state.speaking) setState({ speaking: false, owner: null });
  flushIdle();
  if (next) void speak(next.parts, next.lang, next.opts);
}

/** Resolves when nothing is being said. */
export function whenIdle(): Promise<void> {
  if (!state.speaking) return Promise.resolve();
  return new Promise((resolve) => idleWaiters.push(resolve));
}

/** While the microphone listens, nothing is said (it would be heard as the answer). */
export function holdSpeech(on: boolean): void {
  held = on;
  if (on) stopSpeaking();
}

/** Can this device say text in this language with its own voice? */
export async function hasDeviceVoice(lang: string): Promise<boolean> {
  if (!synthSupported()) return false;
  if (window.speechSynthesis.getVoices().length === 0) await voicesLoaded();
  const all = window.speechSynthesis.getVoices();
  if (voicesFor(lang).length > 0) return true;
  // Some browsers speak English with a default voice without listing any voice.
  return lang === 'en' && all.length === 0;
}

/* ------------------------------------------------------------------ */
/*  Playing a list                                                     */
/* ------------------------------------------------------------------ */

async function run(list: Norm[], uiLang: string, mine: number): Promise<boolean> {
  if (!hasActivation()) {
    const allowed = await canAutoplay();
    if (!allowed) {
      deferredPending = true;
      await gestureReady();
      if (mine !== generation) return false;
      deferredPending = false;
      firstReading = mine;
    }
  }
  // Look every source up at once (recordings, server audio), then play them in order.
  const sources = list.map((part) => resolveSource(part));
  for (const pending of sources) {
    const source = await pending;
    if (mine !== generation) return false;
    if (source.kind === 'skip') continue;
    if (source.kind === 'none') {
      announce(source.text);
      noteUnavailable(source.lang, uiLang);
      continue;
    }
    if (source.kind === 'audio') await playAudio(source.url);
    else await speakDevice(source.text, source.lang);
    if (mine !== generation) return false;
    if (state.unavailable.includes(source.lang)) {
      setState({ unavailable: state.unavailable.filter((l) => l !== source.lang) });
    }
  }
  return true;
}

function normalize(parts: Part[], lang: string): Norm[] {
  const out: Norm[] = [];
  for (const part of parts) {
    if (!part) continue;
    const p: SpeechPart = typeof part === 'string' ? { text: part } : part;
    const text = p.text?.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const chunks = chunk(text, 200);
    for (const piece of chunks) {
      out.push({
        text: piece,
        key: chunks.length === 1 ? p.key : undefined,
        lang: p.lang ?? lang,
        personal: p.personal,
        fallbackKey: p.fallbackKey,
      });
    }
  }
  return out;
}

/** Split long text at sentence ends (then spaces) so no piece is longer than `max`. */
function chunk(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = (text.match(/[^.!?።፧]+[.!?።፧]*/g) ?? [text]).map((s) => s.trim());
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const words = sentence.length > max ? sentence.split(' ') : [sentence];
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > max && current) {
        out.push(current);
        current = word.slice(0, max);
      } else {
        current = next.slice(0, max);
      }
    }
  }
  if (current) out.push(current);
  return out;
}

async function resolveSource(p: Norm): Promise<Source> {
  if (p.personal) {
    if (await hasDeviceVoice(p.lang)) return { kind: 'device', text: p.text, lang: p.lang };
    if (!p.fallbackKey) {
      if (synthSupported()) return { kind: 'device', text: p.text, lang: p.lang };
      return { kind: 'skip' };
    }
    return resolveSource({ text: t(p.lang, p.fallbackKey), key: p.fallbackKey, lang: p.lang });
  }
  const key = p.key ?? keyForText(p.lang, p.text);
  if (key) {
    const url = `${audioBase}${encodeURIComponent(p.lang)}/${encodeURIComponent(key)}.mp3`;
    if (await hasRecording(url)) return { kind: 'audio', url, lang: p.lang };
  }
  if (await hasDeviceVoice(p.lang)) return { kind: 'device', text: p.text, lang: p.lang };
  const url = await serverAudio(p.text, p.lang);
  if (url) return { kind: 'audio', url, lang: p.lang };
  if (synthSupported()) return { kind: 'device', text: p.text, lang: p.lang };
  return { kind: 'none', text: p.text, lang: p.lang };
}

let lastCancel = 0;
function stopPlayback(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
  }
  if (synthSupported() && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel();
    lastCancel = Date.now();
  }
  const finish = finishCurrent;
  finishCurrent = null;
  finish?.();
}

/** Call from a tap or key press (a toggle, Listen): later speech is then allowed to play. */
export function primeSpeech(): void {
  activated = true;
  setState({ activated: true });
  gestureWaiters.splice(0).forEach((resolve) => resolve());
  try {
    if (synthSupported() && !window.speechSynthesis.speaking) {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }
    if (
      typeof Audio !== 'undefined' &&
      !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
    ) {
      const el = audioEl ?? (audioEl = new Audio());
      if (!el.src || el.src === SILENCE) {
        el.src = SILENCE;
        const played = el.play() as Promise<void> | undefined;
        played?.catch?.(() => {});
      }
    }
  } catch {
    // nothing to unlock
  }
}

function flushIdle(): void {
  if (state.speaking) return;
  idleWaiters.splice(0).forEach((resolve) => resolve());
}

function noteUnavailable(lang: string, uiLang: string): void {
  if (!state.unavailable.includes(lang)) setState({ unavailable: [...state.unavailable, lang] });
  if (announced.has(lang)) return;
  announced.add(lang);
  announce(t(uiLang, 'read_aloud.unavailable', { language: languageName(lang) }));
}

/* ------------------------------------------------------------------ */
/*  (a) Recorded clips                                                 */
/* ------------------------------------------------------------------ */

const recordings = new Map<string, Promise<boolean>>();

function hasRecording(url: string): Promise<boolean> {
  let probe = recordings.get(url);
  if (!probe) {
    probe = probeRecording(url);
    recordings.set(url, probe);
  }
  return probe;
}

function probeRecording(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  let sameOrigin = false;
  try {
    sameOrigin = new URL(url, location.href).origin === location.origin;
  } catch {
    return Promise.resolve(false);
  }
  if (sameOrigin && typeof fetch === 'function') {
    // A dev server may answer a missing file with HTML, so check the type too.
    return fetch(url, { method: 'HEAD' })
      .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith('audio'))
      .catch(() => false);
  }
  // The widget's own server is another site: media loads need no CORS, so ask an audio element.
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') return resolve(false);
    const probe = new Audio();
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      probe.removeAttribute('src');
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), 4000);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => done(true);
    probe.onerror = () => done(false);
    probe.src = url;
  });
}

function playAudio(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') return resolve();
    // One element, reused: once allowed to play, it may play again (mobile browsers).
    const el = audioEl ?? (audioEl = new Audio());
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (finishCurrent === finish) finishCurrent = null;
      resolve();
    };
    const timer = window.setTimeout(finish, 60_000);
    finishCurrent = finish;
    el.onended = finish;
    el.onerror = finish;
    el.src = url;
    try {
      const played = el.play() as Promise<void> | undefined;
      if (played && typeof played.catch === 'function') played.catch(finish);
      else finish();
    } catch {
      finish();
    }
  });
}

/* ------------------------------------------------------------------ */
/*  (b) The device's own voice                                         */
/* ------------------------------------------------------------------ */

function synthSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

function voicesFor(lang: string): SpeechSynthesisVoice[] {
  const code = lang.toLowerCase();
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === code);
}

let voicesPromise: Promise<void> | null = null;
function voicesLoaded(): Promise<void> {
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const done = () => {
        synth.removeEventListener?.('voiceschanged', done);
        resolve();
      };
      synth.addEventListener?.('voiceschanged', done);
      window.setTimeout(done, 1500);
    });
  }
  return voicesPromise;
}

function speakDevice(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechTag(lang);
    const voices = voicesFor(lang);
    const tag = speechTag(lang).toLowerCase();
    const voice =
      voices.find((v) => v.lang.toLowerCase().replace('_', '-') === tag && v.localService) ??
      voices.find((v) => v.lang.toLowerCase().replace('_', '-') === tag) ??
      voices[0];
    if (voice) u.voice = voice;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (finishCurrent === finish) finishCurrent = null;
      resolve();
    };
    // onend is sometimes never fired: don't wait for ever.
    const timer = window.setTimeout(finish, 4000 + text.length * 150);
    u.onend = finish;
    u.onerror = finish;
    utterance = u;
    finishCurrent = finish;
    // Chrome may drop an utterance given right after cancel(): wait a moment.
    const wait = Math.max(0, lastCancel + 80 - Date.now());
    window.setTimeout(() => {
      if (!done && utterance === u) synth.speak(u);
    }, wait);
  });
}

/* ------------------------------------------------------------------ */
/*  (c) The server voice: fixed interface text only                    */
/* ------------------------------------------------------------------ */

const serverClips = new Map<string, Promise<string | null>>();
const serverOffUntil = new Map<string, number>();
let serverMissing = false; // the API has no synthesis endpoint at all
const MAX_CLIPS = 200;

function serverAudio(text: string, lang: string): Promise<string | null> {
  if (!api || serverMissing || (serverOffUntil.get(lang) ?? 0) > Date.now()) {
    return Promise.resolve(null);
  }
  const cacheKey = `${lang}|${text}`;
  let clip = serverClips.get(cacheKey);
  if (!clip) {
    const cfg = api;
    clip = synthesize(cfg, text, lang)
      .then((blob) => URL.createObjectURL(blob))
      .catch((err: unknown) => {
        serverClips.delete(cacheKey);
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 503) serverOffUntil.set(lang, Date.now() + 15_000);
        else if ([200, 404, 405, 501].includes(status)) serverMissing = true;
        else if (status === 0 || status >= 500) serverOffUntil.set(lang, Date.now() + 60_000);
        return null;
      });
    serverClips.set(cacheKey, clip);
    if (serverClips.size > MAX_CLIPS) {
      const oldest = serverClips.keys().next().value;
      if (oldest !== undefined) {
        const old = serverClips.get(oldest);
        serverClips.delete(oldest);
        void old?.then((url) => url && URL.revokeObjectURL(url));
      }
    }
  }
  return clip;
}
