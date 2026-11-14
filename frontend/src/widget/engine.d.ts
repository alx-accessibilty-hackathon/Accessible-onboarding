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
    | { type: 'SYNCED'; stepId: string; version: number }
    | { type: 'CLEAR_ERROR'; stepId: string };
}
