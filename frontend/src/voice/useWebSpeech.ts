import { useCallback, useEffect, useRef, useState } from 'react';
import { speechTag } from '../i18n/registry';

/** Error states surfaced to the UI. */
export type SpeechError = 'not-allowed' | 'no-speech' | 'network' | 'aborted' | null;

export interface SpeechAlternative {
  text: string;
  /** 0..1; 0 when the browser gives none. */
  confidence: number;
}

/** What one listening session reports. Only the session that is current reports anything. */
export interface WebSpeechHandlers {
  /** What was heard: the best guess first, then other guesses (maxAlternatives = 3). Called at
   * most once per session, and only once the microphone is closed (so nothing said next, such
   * as "We heard: …", can be heard as a new answer). `onEnd(true)` follows straight away. */
  onResult: (alternatives: SpeechAlternative[]) => void;
  onError: (error: Exclude<SpeechError, null>) => void;
  /** The session ended; `gotResult` is false when nothing was heard. */
  onEnd: (gotResult: boolean) => void;
}

export interface UseWebSpeechReturn {
  /** Whether the browser supports SpeechRecognition at all. */
  supported: boolean;
  /** Currently listening for speech. */
  listening: boolean;
  /** Begin recognition in a language ("am" → am-ET, "en" → en-US). */
  start: (lang: string, handlers: WebSpeechHandlers) => void;
  /** Stop listening: what was said so far still comes as a result. */
  stop: () => void;
  /** Cancel: nothing more is reported. */
  abort: () => void;
}

interface SpeechResultEvent {
  /** The first result that is new in this event. */
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: {
      length: number;
      isFinal?: boolean;
      [index: number]: { transcript: string; confidence?: number };
    };
  };
}

interface SpeechErrorEvent {
  error: string;
}

// Minimal Web Speech API interface declarations for TypeScript
interface ISpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/** Map our language code to a full BCP-47 tag (from the locale file: am → am-ET). */
function toLangCode(lang: string): string {
  if (lang.includes('-')) return lang;
  if (lang === 'am') return 'am-ET';
  if (lang === 'en') return 'en-US';
  return speechTag(lang);
}

/** Map a SpeechRecognitionErrorEvent.error to our UI error enum. */
function mapError(error: string): Exclude<SpeechError, null> {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'aborted':
      return 'aborted';
    default:
      return 'network'; // unknown errors (network, language-not-supported…): use another way
  }
}

/** Get the SpeechRecognition constructor, or null if unsupported. */
function getSpeechRecognitionCtor(): (new () => ISpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function detach(r: ISpeechRecognition | null): void {
  if (!r) return;
  r.onresult = null;
  r.onerror = null;
  r.onend = null;
}

/**
 * The guesses of the first final result in this event (best first), or null if it has none.
 * Only that one result is used: some browsers (WebKit, some Android builds) repeat a phrase
 * as extra results, and joining them made the answer grow ("abebe kebede abebe kebede …").
 */
function firstFinal(event: SpeechResultEvent): SpeechAlternative[] | null {
  const results = event.results;
  if (!results) return null;
  for (let i = event.resultIndex ?? 0; i < results.length; i++) {
    const result = results[i];
    if (!result || result.isFinal === false) continue;
    const alternatives: SpeechAlternative[] = [];
    for (let j = 0; j < result.length; j++) {
      const alt = result[j];
      if (alt?.transcript?.trim()) {
        alternatives.push({ text: alt.transcript.trim(), confidence: alt.confidence ?? 0 });
      }
    }
    if (alternatives.length > 0) return alternatives;
  }
  return null;
}

/** How long to wait for the browser's "end" after we closed the microphone ourselves. */
const END_WAIT_MS = 1500;

/**
 * React hook wrapping the Web Speech Recognition API.
 * Never starts without an explicit `start()` call. Each `start()` replaces the previous session,
 * whose events are ignored from then on (so an old "aborted" can't spoil the new one).
 * A session gives at most one answer: the first final result. The microphone is then closed at
 * once, and the answer is reported only when it is closed.
 */
export function useWebSpeech(): UseWebSpeechReturn {
  const Ctor = getSpeechRecognitionCtor();
  const supported = Ctor !== null;

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  // Cancels the current session's pending report (the wait for "end" after a result).
  const cancelRef = useRef<(() => void) | null>(null);

  const abort = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    detach(r);
    try {
      r?.abort();
    } catch {
      // already stopped
    }
    setListening(false);
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop(); // the final result still arrives, then onend
    } catch {
      // already stopped
    }
  }, []);

  const start = useCallback(
    (lang: string, handlers: WebSpeechHandlers) => {
      if (!Ctor) return;
      abort(); // tear down any previous session (its events are ignored)

      const recognition = new Ctor();
      recognition.lang = toLangCode(lang);
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;

      let result: SpeechAlternative[] | null = null;
      let finished = false;
      let endTimer: number | undefined;

      // The session is over (the browser said "end", or it didn't in time after a result):
      // report the one answer, if there is one, then the end.
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(endTimer);
        if (cancelRef.current === cancel) cancelRef.current = null;
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        detach(recognition);
        setListening(false);
        if (result) handlers.onResult(result);
        handlers.onEnd(result !== null);
      };
      const cancel = () => {
        finished = true;
        window.clearTimeout(endTimer);
      };
      cancelRef.current = cancel;

      recognition.onresult = (event: SpeechResultEvent) => {
        if (result) return; // one answer per session: later (repeated) results are ignored
        const alternatives = firstFinal(event);
        if (!alternatives) return;
        result = alternatives;
        recognition.onresult = null;
        // Close the microphone now: whatever is said next must not become a new answer.
        try {
          recognition.abort();
        } catch {
          // already stopped
        }
        endTimer = window.setTimeout(finish, END_WAIT_MS); // some browsers never say "end"
      };

      recognition.onerror = (event: SpeechErrorEvent) => {
        const error = mapError(event.error);
        // "aborted" is our own abort (after a result, or a new session): not a problem.
        if (error === 'aborted' || result) return;
        handlers.onError(error);
      };

      recognition.onend = finish;

      recognitionRef.current = recognition;
      setListening(true);
      try {
        recognition.start();
      } catch {
        // Already started or another error
        cancel();
        if (cancelRef.current === cancel) cancelRef.current = null;
        recognitionRef.current = null;
        detach(recognition);
        setListening(false);
        handlers.onError('network');
      }
    },
    [Ctor, abort],
  );

  // Leaving the question: stop listening.
  useEffect(() => abort, [abort]);

  return { supported, listening, start, stop, abort };
}
