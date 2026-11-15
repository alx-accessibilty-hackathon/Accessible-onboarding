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
  /** What was heard: the best guess first, then other guesses (maxAlternatives = 3). */
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
  results: {
    length: number;
    [index: number]: {
      length: number;
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
 * React hook wrapping the Web Speech Recognition API.
 * Never starts without an explicit `start()` call. Each `start()` replaces the previous session,
 * whose events are ignored from then on (so an old "aborted" can't spoil the new one).
 */
export function useWebSpeech(): UseWebSpeechReturn {
  const Ctor = getSpeechRecognitionCtor();
  const supported = Ctor !== null;

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const abort = useCallback(() => {
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
      let gotResult = false;

      recognition.onresult = (event: SpeechResultEvent) => {
        const results = event.results;
        if (!results || results.length === 0) return;
        let alternatives: SpeechAlternative[];
        if (results.length === 1) {
          alternatives = [];
          for (let j = 0; j < results[0].length; j++) {
            const alt = results[0][j];
            if (alt?.transcript?.trim()) {
              alternatives.push({ text: alt.transcript.trim(), confidence: alt.confidence ?? 0 });
            }
          }
        } else {
          let text = '';
          for (let i = 0; i < results.length; i++) text += `${results[i][0].transcript} `;
          alternatives = [{ text: text.trim(), confidence: results[0][0].confidence ?? 0 }];
        }
        if (alternatives.length === 0) return;
        gotResult = true;
        handlers.onResult(alternatives);
      };

      recognition.onerror = (event: SpeechErrorEvent) => {
        const error = mapError(event.error);
        if (error === 'aborted') return;
        handlers.onError(error);
      };

      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        detach(recognition);
        setListening(false);
        handlers.onEnd(gotResult);
      };

      recognitionRef.current = recognition;
      setListening(true);
      try {
        recognition.start();
      } catch {
        // Already started or another error
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
