import type { AnswerState, Flow } from '../engine/types';

declare module '../engine/types' {
  export interface EngineState {
    flow: Flow;
    currentId: string;
    history: string[];
    answers: Record<string, AnswerState>;
    errors: Record<string, string>;
    returnTo?: string;
    userNavigated?: boolean;
  }

  export type EngineAction =
    | {
        type: 'ANSWER';
        stepId: string;
        value: unknown;
        inputMethod?: 'typed' | 'voice' | 'choice' | 'partner';
      }
    | { type: 'CONTINUE' }
    | { type: 'BACK' }
    | { type: 'GOTO'; stepId: string }
    | { type: 'RESTORE'; answers: Record<string, AnswerState>; currentStep?: string }
    | { type: 'VOICE_PENDING'; stepId: string; clipId: string }
    | {
        type: 'SYNCED';
        stepId: string;
        version: number;
        // The server's (cleaned) value, e.g. a phone in E.164, or another device's answer.
        value?: unknown;
        inputMethod?: 'typed' | 'voice' | 'choice' | 'partner';
      }
    | { type: 'CLEAR_ERROR'; stepId: string };
}
