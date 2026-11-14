import type { AnswerState, Flow, NextRule, Step } from './types';

export function getRawAnswerValue(
  answers: Record<string, AnswerState | unknown>,
  stepId: string,
): unknown {
  const ans = answers[stepId];
  if (ans === undefined || ans === null) return undefined;
  if (typeof ans === 'object' && ans !== null && 'value' in ans) {
    return (ans as AnswerState).value;
  }
  return ans;
}

export function evaluateNextRule(
  rule: NextRule,
  answers: Record<string, AnswerState | unknown>,
): boolean {
  if (!rule.when) return true;

  const { step, equals, in: inList } = rule.when;
  const rawValue = getRawAnswerValue(answers, step);

  if (equals !== undefined) {
    return String(rawValue) === String(equals);
  }

  if (inList !== undefined && Array.isArray(inList)) {
    if (rawValue === undefined || rawValue === null) return false;
    return inList.map(String).includes(String(rawValue));
  }

  return true;
}

export function nextStepId(
  flow: Flow,
  stepId: string,
  answers: Record<string, AnswerState | unknown>,
): string | null {
  const step: Step | undefined = flow.steps.find((s) => s.id === stepId);
  if (!step || !step.next) return null;

  if (typeof step.next === 'string') {
    return step.next;
  }

  if (Array.isArray(step.next)) {
    for (const rule of step.next) {
      if (evaluateNextRule(rule, answers)) {
        return rule.goto;
      }
    }
  }

  return null;
}
