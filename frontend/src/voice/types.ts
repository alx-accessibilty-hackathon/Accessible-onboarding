import type { Step } from '../engine/types';

// The contract between FE-A (fields) and FE-B (voice). FE-B builds <VoiceInput>;
// FE-A places it under every input. See TECHNICAL_PLAN.md 4.2 and section 3.
export interface VoiceInputProps {
  step: Step; // tells the clean-up rules the field type
  lang: string; // 'am' | 'en'
  onConfirm: (value: unknown) => void; // the person pressed Keep on the "We heard" card
  onPending: (clipId: string) => void; // offline: clip saved on the phone, waiting for text
}
