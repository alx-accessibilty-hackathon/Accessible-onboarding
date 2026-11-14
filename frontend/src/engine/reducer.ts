import { nextStepId } from './next';
import { computePath } from './progress';
import type { AnswerState, EngineAction, EngineState, Flow } from './types';
import { validateStep } from './validate';

export function createInitialState(flow: Flow): EngineState {
  return {
    flow,
    currentId: flow.start,
    history: [],
    answers: {},
    errors: {},
    returnTo: undefined,
    userNavigated: false,
  };
}

export function engineReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'ANSWER': {
      const existing = state.answers[action.stepId];
      const version = existing ? existing.version : 0;
      const updatedAnswer: AnswerState = {
        value: action.value,
        version,
        inputMethod: action.inputMethod ?? existing?.inputMethod ?? 'typed',
        synced: false,
        pendingClipId: existing?.pendingClipId,
      };

      const newErrors = { ...state.errors };
      delete newErrors[action.stepId];

      return {
        ...state,
        answers: {
          ...state.answers,
          [action.stepId]: updatedAnswer,
        },
        errors: newErrors,
      };
    }

    case 'CONTINUE': {
      const currentStep = state.flow.steps.find((s) => s.id === state.currentId);
      if (!currentStep) return state;

      const currentValue = state.answers[state.currentId]?.value;
      const validationError = validateStep(currentStep, currentValue);

      if (validationError) {
        return {
          ...state,
          errors: {
            ...state.errors,
            [state.currentId]: validationError,
          },
        };
      }

      // Valid: clear error for this step
      const newErrors = { ...state.errors };
      delete newErrors[state.currentId];

      // If returning to Check your answers
      if (state.returnTo) {
        // A changed answer can open a new branch (e.g. phone after "Phone call or SMS"):
        // ask its unanswered questions first, then go back to Check your answers.
        const branchId = nextStepId(state.flow, state.currentId, state.answers);
        const branchStep = branchId ? state.flow.steps.find((s) => s.id === branchId) : undefined;
        if (
          branchStep &&
          branchStep.id !== state.returnTo &&
          !['info', 'consent', 'check_answers', 'done'].includes(branchStep.type) &&
          state.answers[branchStep.id] === undefined
        ) {
          return {
            ...state,
            currentId: branchStep.id,
            history: [...state.history, state.currentId],
            errors: newErrors,
            userNavigated: true,
          };
        }
        return {
          ...state,
          currentId: state.returnTo,
          returnTo: undefined,
          history: [...state.history, state.currentId],
          errors: newErrors,
          userNavigated: true,
        };
      }

      // Calculate next step
      const nextId = nextStepId(state.flow, state.currentId, state.answers);
      if (!nextId) {
        return {
          ...state,
          errors: newErrors,
        };
      }

      return {
        ...state,
        currentId: nextId,
        history: [...state.history, state.currentId],
        errors: newErrors,
        userNavigated: true,
      };
    }

    case 'BACK': {
      if (state.history.length === 0) return state;

      const newHistory = [...state.history];
      const prevId = newHistory.pop()!;

      return {
        ...state,
        currentId: prevId,
        history: newHistory,
        returnTo: undefined,
        errors: {},
        userNavigated: true,
      };
    }

    case 'GOTO': {
      const currentStep = state.flow.steps.find((s) => s.id === state.currentId);
      const isFromCheck = currentStep?.type === 'check_answers';

      return {
        ...state,
        currentId: action.stepId,
        history: [...state.history, state.currentId],
        returnTo: isFromCheck ? state.currentId : state.returnTo,
        errors: {},
        userNavigated: true,
      };
    }

    case 'RESTORE': {
      const targetStep =
        action.currentStep && state.flow.steps.some((s) => s.id === action.currentStep)
          ? action.currentStep
          : state.currentId;

      // Back after a reload walks the path the saved answers lead to.
      const pathIds = computePath(state.flow, action.answers).map((s) => s.id);
      const idx = pathIds.indexOf(targetStep);

      return {
        ...state,
        answers: { ...action.answers },
        currentId: targetStep,
        history: idx > 0 ? pathIds.slice(0, idx) : [],
        returnTo: undefined,
        errors: {},
      };
    }

    case 'VOICE_PENDING': {
      const existing = state.answers[action.stepId];
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.stepId]: {
            value: existing?.value ?? null,
            version: existing?.version ?? 0,
            inputMethod: 'voice',
            synced: false,
            pendingClipId: action.clipId,
          },
        },
      };
    }

    case 'SYNCED': {
      const existing = state.answers[action.stepId];
      if (!existing && action.value === undefined) return state;
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.stepId]: {
            value: action.value !== undefined ? action.value : existing?.value,
            inputMethod: action.inputMethod ?? existing?.inputMethod ?? 'typed',
            pendingClipId: existing?.pendingClipId,
            version: action.version,
            synced: true,
          },
        },
      };
    }

    case 'CLEAR_ERROR': {
      const newErrors = { ...state.errors };
      delete newErrors[action.stepId];
      return {
        ...state,
        errors: newErrors,
      };
    }

    default:
      return state;
  }
}
