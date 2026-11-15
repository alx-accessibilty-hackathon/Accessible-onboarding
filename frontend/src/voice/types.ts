import type { Step } from '../engine/types';

/** What a recorded clip became: the text for the field, or an error code. `provider` "mock" is
 * the server's test voice service (sample text, not what was said). */
export type VoiceClipOutcome = { text: string; raw?: string; provider?: string } | { code: string };

/** An option of a single-choice question, as shown, for matching what was said. */
export interface VoiceChoice {
  value: string;
  label: string; // the on-screen label (translated, or a partner's name)
  say?: string[]; // extra words from the flow file
}

// The contract between FE-A (fields) and FE-B (voice). FE-B builds <VoiceInput>;
// FE-A places it under every input. See TECHNICAL_PLAN.md 4.2 and section 3.
export interface VoiceInputProps {
  step: Step; // tells the clean-up rules the field type
  lang: string; // 'am' | 'en'
  /** Put this value in the field (Keep on the "We heard" card; at once in Answer by speaking). */
  onConfirm: (value: unknown) => void;
  /** Recorded clip saved on the phone: turn it into text (the field is filled by the flow). */
  onPending: (clipId: string) => Promise<VoiceClipOutcome | null> | void;
  onSpeechConsent?: (granted: boolean) => void; // SH-6 answer, recorded with POST …/consents
  /** Answer by speaking mode: what is heard goes straight into the field (no Keep). */
  mode?: boolean;
  /** Start listening by itself, once (Answer by speaking, after the question was read). */
  autoStart?: boolean;
  /** single_choice: the options, to pick one by what was said. */
  choices?: VoiceChoice[];
}
