import employerJob from '@shared/flows/employer-job.json';
import jobApplication from '@shared/flows/job-application.json';
import signup from '@shared/flows/signup.json';
import { t } from '../i18n/t';
import { QuestionScreen } from '../screens/QuestionScreen';
import type { Flow } from './types';

const flows: Record<string, Flow> = {
  signup: signup as Flow,
  'job-application': jobApplication as Flow,
  'employer-job': employerJob as Flow,
};

// SKELETON: shows the first step only.
// TODO (FA-2): useReducer engine: answers, Continue/Back, branching (next rules), validation,
// return to Check your answers, progress "Question n of N", restore from saved data.
export function FlowRunner({ flowId, lang }: { flowId: string; lang: string }) {
  const flow = flows[flowId];
  const step = flow?.steps.find((s) => s.id === flow.start);
  if (!step) return <p>{t(lang, 'errors.unknown_flow')}</p>;

  return <QuestionScreen step={step} lang={lang} />;
}
