import { Button } from '../components/Button';
import type { Step } from '../engine/types';
import { t } from '../i18n/t';

// SKELETON: heading and hint only.
// TODO (FA-3): W4 markup (label inside h1 for one input; fieldset + legend with the h1 for choices),
// the field for step.type, error summary, voice input (FB's VoiceInput), focus and title on each step.
export function QuestionScreen({ step, lang }: { step: Step; lang: string }) {
  const headingId = `q-${step.id}-title`;

  return (
    <section aria-labelledby={headingId}>
      <h1 id={headingId} tabIndex={-1}>
        {t(lang, step.title)}
      </h1>
      {step.hint && <p className="bo-hint">{t(lang, step.hint)}</p>}
      <div className="bo-actions">
        <Button>{t(lang, 'common.continue')}</Button>
      </div>
    </section>
  );
}
