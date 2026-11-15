// The two speech modes (Read aloud, Answer by speaking) as React state, and the hooks that
// read screens aloud. Under a ModesProvider (the widget, the staff pages) Read aloud is on until
// the person turns it off (settings.ts), and nothing plays before their first key press or tap
// (speaker.ts). Without a provider (unit tests of single screens) nothing is read by itself.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { setSetting, useSetting } from './settings';
import {
  getSpeakerState,
  speak,
  stopSpeaking,
  subscribeSpeaker,
  whenIdle,
  type Part,
  type SpeakerState,
} from './speaker';

export interface Modes {
  readAloud: boolean;
  answerBySpeaking: boolean;
  /** False for content that is on the page but hidden (behind the language screen). */
  active: boolean;
  setReadAloud: (on: boolean) => void;
  setAnswerBySpeaking: (on: boolean) => void;
}

const ModesContext = createContext<Modes>({
  readAloud: false,
  answerBySpeaking: false,
  active: false,
  setReadAloud: () => {},
  setAnswerBySpeaking: () => {},
});

/** The widget root: modes come from the person's saved settings. */
export function ModesProvider({ children }: { children: ReactNode }) {
  const readAloud = useSetting('readAloud');
  const answerBySpeaking = useSetting('answerBySpeaking');
  const value = useMemo<Modes>(
    () => ({
      readAloud,
      answerBySpeaking,
      active: true,
      setReadAloud: (on) => setSetting('readAloud', on),
      setAnswerBySpeaking: (on) => setSetting('answerBySpeaking', on),
    }),
    [readAloud, answerBySpeaking],
  );
  return <ModesContext.Provider value={value}>{children}</ModesContext.Provider>;
}

/** Content under this is read by itself only when `active` (e.g. not while it is hidden). */
export function ReadScope({ active, children }: { active: boolean; children: ReactNode }) {
  const parent = useContext(ModesContext);
  const value = useMemo(() => ({ ...parent, active: parent.active && active }), [parent, active]);
  return <ModesContext.Provider value={value}>{children}</ModesContext.Provider>;
}

export function useModes(): Modes {
  return useContext(ModesContext);
}

export function useSpeakerState(): SpeakerState {
  return useSyncExternalStore(subscribeSpeaker, getSpeakerState, getSpeakerState);
}

/**
 * Read Aloud mode: say `build()` each time `key` changes (a new screen, an error that appeared,
 * a dialog that opened). Nothing happens when the mode is off or the content is hidden.
 * `onDone` runs when the reading is over (or was replaced by other speech) and all is quiet.
 */
export function useAutoRead(
  key: string | null,
  build: () => Part[],
  lang: string,
  onDone?: () => void,
): void {
  const { readAloud, active } = useModes();
  const buildRef = useRef(build);
  buildRef.current = build;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!readAloud || !active || key === null) return;
    let live = true;
    void speak(buildRef.current(), lang, { owner: key })
      .then(() => whenIdle())
      .then(() => {
        if (live) doneRef.current?.();
      });
    return () => {
      live = false;
      stopSpeaking(key); // the screen went away: stop reading it
    };
  }, [key, readAloud, active, lang]);
}
