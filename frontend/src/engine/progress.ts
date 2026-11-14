import { nextStepId } from './next';
import type { AnswerState, Flow, Step } from './types';

const NON_INPUT_TYPES = new Set(['info', 'consent', 'check_answers', 'done']);

export interface ProgressState {
  n: number;
  total: number;
}

export function computePath(flow: Flow, answers: Record<string, AnswerState | unknown>): Step[] {
  const path: Step[] = [];
  const visited = new Set<string>();

  let currId: string | null = flow.start;

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const step = flow.steps.find((s) => s.id === currId);
    if (!step) break;
    path.push(step);

    currId = nextStepId(flow, currId, answers);
  }

  return path;
}

export function computeProgress(
  flow: Flow,
  currentId: string,
  answers: Record<string, AnswerState | unknown>,
): ProgressState {
  const path = computePath(flow, answers);
  const inputSteps = path.filter((s) => !NON_INPUT_TYPES.has(s.type));
  const total = inputSteps.length;

  const currentStep = flow.steps.find((s) => s.id === currentId);
  if (!currentStep) {
    return { n: 1, total: Math.max(total, 1) };
  }

  // If on check_answers or done, progress is at total
  if (currentStep.type === 'check_answers' || currentStep.type === 'done') {
    return { n: total, total };
  }

  // If before first input step (e.g. welcome or consent)
  const currentIndexInInputs = inputSteps.findIndex((s) => s.id === currentId);
  if (currentIndexInInputs === -1) {
    // Find where in the general path currentStep is
    const idxInPath = path.findIndex((s) => s.id === currentId);
    // Count how many input steps occur before this in path
    const precedingInputs = path
      .slice(0, idxInPath)
      .filter((s) => !NON_INPUT_TYPES.has(s.type)).length;
    return { n: Math.min(precedingInputs + 1, total), total };
  }

  return { n: currentIndexInInputs + 1, total };
}
