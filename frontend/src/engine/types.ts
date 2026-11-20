// The flow file format (shared/flows/*.json). Read by the widget AND the Go API.
// See TECHNICAL_PLAN.md 2.3. Change it only together with the backend team.

export type StepType =
  | 'info'
  | 'consent'
  | 'text'
  | 'long_text'
  | 'phone'
  | 'date'
  | 'digits'
  | 'single_choice'
  | 'multi_choice'
  | 'file'
  | 'check_answers'
  | 'done';

// answer = PUT …/answers/{id}; support = PUT …/support-request (private); none = stays on the device
export type Storage = 'answer' | 'support' | 'none';

export interface Option {
  value: string;
  label: string; // language-file key
  icon?: string;
  say?: string[]; // extra words voice input should recognise
  /** Built in the app, never in a flow file: `label` is shown as it is (e.g. "አማርኛ")… */
  literal?: boolean;
  /** …in this language (its `lang` attribute), when it isn't the page's. */
  lang?: string;
}

export interface Rule {
  rule: 'min_length' | 'max_length' | 'pattern' | 'digits' | 'phone_et' | 'date_valid';
  value?: number | string;
  error: string; // error code, translated via errors.<code>
}

export interface NextRule {
  when?: { step: string; equals?: string; in?: string[] };
  goto: string;
}

export interface Step {
  id: string;
  type: StepType;
  title: string;
  hint?: string;
  icon?: string;
  required?: boolean;
  storage?: Storage;
  autocomplete?: string;
  validate?: Rule[];
  options?: Option[];
  options_from?: string; // "vocab:needs" | "config:referral_partners"
  calendar_default?: Record<string, 'ethiopian' | 'gregorian'>;
  /** If true, the date must be today or in the future (e.g. job application start date). */
  future_only?: boolean;
  next?: string | NextRule[];
}

export interface Flow {
  id: string;
  version: number;
  start: string;
  steps: Step[];
}

export interface AnswerState {
  value: unknown;
  version: number; // server version; sent back as base_version
  inputMethod: 'typed' | 'voice' | 'choice' | 'partner';
  synced: boolean;
  pendingClipId?: string; // voice clip waiting to be transcribed (offline)
}
