import { useCallback, useRef, useState } from 'react';

/** Error states surfaced to the UI. */
export type SpeechError = 'not-allowed' | 'no-speech' | 'network' | 'aborted' | null;

export interface UseWebSpeechReturn {
  /** Whether the browser supports SpeechRecognition at all. */
  supported: boolean;
  /** Currently listening for speech. */
  listening: boolean;
  /** The accumulated transcript from the current session. */
  transcript: string;
  /** The current error state, or null. */
  error: SpeechError;
  /** Begin recognition. Must be called from a user-initiated event handler. */
  start: (lang: string) => void;
  /** Stop recognition. */
  stop: () => void;
}

interface SpeechResultEvent {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
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

/** Map the browser's `lang` shorthand to a full BCP-47 tag. */
function toLangCode(lang: string): string {
  if (lang === 'am') return 'am-ET';
  if (lang === 'en') return 'en-US';
  return lang;
}

/** Map a SpeechRecognitionErrorEvent.error to our UI error enum. */
function mapError(error: string): SpeechError {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    default:
      return 'network'; // unknown errors surface as recoverable
  }
}

/** Get the SpeechRecognition constructor, or null if unsupported. */
function getSpeechRecognitionCtor(): (new () => ISpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * React hook wrapping the Web Speech Recognition API.
 * Never starts without an explicit `start()` call (user action).
 */
export function useWebSpeech(): UseWebSpeechReturn {
  const Ctor = getSpeechRecognitionCtor();
  const supported = Ctor !== null;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<SpeechError>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(
    (lang: string) => {
      if (!Ctor) return;

      // Tear down any previous session
      recognitionRef.current?.abort();

      const recognition = new Ctor();
      recognition.lang = toLangCode(lang);
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechResultEvent) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        setTranscript(text);
      };

      recognition.onerror = (event: SpeechErrorEvent) => {
        setError(mapError(event.error));
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      setTranscript('');
      setError(null);
      setListening(true);

      try {
        recognition.start();
      } catch {
        // Already started or another error
        setError('aborted');
        setListening(false);
      }

      recognitionRef.current = recognition;
    },
    [Ctor],
  );

  return { supported, listening, transcript, error, start, stop };
}
