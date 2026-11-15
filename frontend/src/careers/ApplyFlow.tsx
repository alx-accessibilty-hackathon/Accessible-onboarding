import { useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../a11y/announce';
import { useAutoRead } from '../a11y/modes';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { ListenButton } from '../i18n/ReadAloud';
import { isMarkedRegistered, loadSession, type LearnerSession } from '../api/auth';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import { submitApplication, type ApplicationAnswerItem } from '../api/applications';
import { fetchJob } from '../api/jobs';
import { getRegistration, type Answer } from '../api/registrations';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FlowRunner, type FlowHooks, type SubmitOutcome } from '../engine/FlowRunner';
import { t } from '../i18n/t';
import { formatEthiopianPhoneDisplay } from '../lib/phone';
import { transcribeClip } from '../voice/transcribeClip';
import type { WidgetEvent } from '../widget/emit';
import type { Job } from './match';

export interface ApplyFlowProps {
  api: ApiConfig; // origin + partner key, no token
  lang: string;
  jobId: string;
  job?: Job | null;
  manageTitle: boolean;
  emit: (name: WidgetEvent, detail?: object) => void;
  onBackToJobs: () => void;
  onSignUp: () => void;
}

type Status = 'checking' | 'signup_needed' | 'ready' | 'error';

// JA-1…JA-6: apply for one job with the learner's account (POST /jobs/{id}/applications).
export function ApplyFlow({
  api,
  lang,
  jobId,
  job: givenJob,
  manageTitle,
  emit,
  onBackToJobs,
  onSignUp,
}: ApplyFlowProps) {
  const [status, setStatus] = useState<Status>('checking');
  const [errorCodeText, setErrorCodeText] = useState('internal_error');
  const [job, setJob] = useState<Job | null>(givenJob ?? null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [session, setSession] = useState<LearnerSession | null>(null);
  const [contact, setContact] = useState<Record<string, Answer>>({});
  const [retry, setRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The job (when we only have its id, e.g. from the job-id attribute).
  useEffect(() => {
    if (givenJob && givenJob.id === jobId) return;
    let active = true;
    setJobError(null);
    fetchJob(api, jobId)
      .then((j) => {
        if (active) setJob(j);
      })
      .catch((err) => {
        if (active) setJobError(errorCode(err));
      });
    return () => {
      active = false;
    };
  }, [api, jobId, givenJob, retry]);

  // Only a registered learner can apply: check the account on this phone.
  useEffect(() => {
    let active = true;
    setStatus('checking');
    void (async () => {
      const s = await loadSession().catch(() => null);
      if (!active) return;
      if (!s) {
        setStatus('signup_needed');
        return;
      }
      setSession(s);
      try {
        const reg = await getRegistration({ ...api, token: s.token }, s.registrationId);
        if (!active) return;
        setContact(reg.answers ?? {});
        setStatus(reg.status === 'submitted' ? 'ready' : 'signup_needed');
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          setStatus('signup_needed');
        } else if (await isMarkedRegistered().catch(() => false)) {
          setStatus('ready'); // offline: the phone remembers the sign-up finished
        } else {
          setErrorCodeText(errorCode(err));
          setStatus('error');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [api, retry]);

  const failed = status === 'error' || jobError !== null;
  useEffect(() => {
    if (status === 'signup_needed' || failed) headingRef.current?.focus();
  }, [status, failed]);

  // Read aloud mode: these screens are read like the sign-up screens.
  const problemParts = (): Part[] => [
    keyPart(lang, 'apply.problem_title'),
    t(lang, `errors.${jobError ?? errorCodeText}`),
  ];
  const signupFirstParts = (): Part[] => [
    keyPart(lang, 'apply.signup_first_title'),
    t(lang, 'apply.signup_first_body', { title: job?.title ?? '' }),
  ];
  useAutoRead(
    failed ? 'apply:problem' : status === 'signup_needed' ? 'apply:signup-first' : null,
    () => (failed ? problemParts() : signupFirstParts()),
    lang,
  );

  const hooks = useMemo<FlowHooks>(
    () => ({
      onStepChange: (step, progress) =>
        emit('step-changed', { step: step.id, index: progress.n, total: progress.total }),
      onSubmit: async (state, path): Promise<SubmitOutcome> => {
        if (!session) return { ok: false, code: 'apply_not_registered' };
        const answers: Record<string, ApplicationAnswerItem> = {};
        for (const step of path) {
          const a = state.answers[step.id];
          if (step.storage !== 'answer' || !a) continue;
          answers[step.id] = { value: a.value, input_method: a.inputMethod };
        }
        try {
          const res = await submitApplication({ ...api, token: session.token }, jobId, {
            answers,
            attach_support_request: state.answers.attach_support?.value === 'yes',
          });
          emit('application-submitted', { job_id: jobId, application_id: res.id });
          return { ok: true };
        } catch (err) {
          let code = errorCode(err);
          if (err instanceof ApiError && err.status === 403) code = 'apply_not_registered';
          if (err instanceof ApiError && err.status === 409) code = 'already_applied';
          emit('error', { code });
          if (err instanceof ApiError && err.status === 422) {
            return { ok: false, code, fields: err.errors };
          }
          return { ok: false, code };
        }
      },
      onVoiceClip: async (clipId, step) => {
        if (!session) return null;
        const res = await transcribeClip({ ...api, token: session.token }, clipId, step, lang);
        if ('text' in res) return res; // with `provider`: "mock" is the test voice service
        announce(t(lang, `errors.${res.code}`));
        return res;
      },
    }),
    [api, emit, jobId, lang, session],
  );

  if (failed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
        <h1 tabIndex={-1} ref={headingRef}>
          {t(lang, 'apply.problem_title')}
        </h1>
        <Banner variant="error">{t(lang, `errors.${jobError ?? errorCodeText}`)}</Banner>
        <div className="bo-actions">
          <Button variant="primary" onClick={() => setRetry((n) => n + 1)}>
            {t(lang, 'common.try_again')}
          </Button>
          <Button variant="secondary" onClick={onBackToJobs}>
            {t(lang, 'jobs.back_to_jobs')}
          </Button>
          <ListenButton lang={lang} parts={problemParts} />
        </div>
      </div>
    );
  }

  if (status === 'checking') return <p>{t(lang, 'common.loading')}</p>;

  if (status === 'signup_needed') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
        <h1 tabIndex={-1} ref={headingRef}>
          {t(lang, 'apply.signup_first_title')}
        </h1>
        <p style={{ margin: 0 }}>
          {t(lang, 'apply.signup_first_body', { title: job?.title ?? '' })}
        </p>
        <div className="bo-actions">
          <Button variant="primary" onClick={onSignUp}>
            {t(lang, 'apply.signup_first_action')}
          </Button>
          <Button variant="secondary" onClick={onBackToJobs}>
            {t(lang, 'jobs.back_to_jobs')}
          </Button>
          <ListenButton lang={lang} parts={signupFirstParts} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}>
      {job && (
        <p className="bo-hint" style={{ margin: 0 }}>
          {t(lang, 'apply.applying_for', { title: job.title })}
        </p>
      )}
      <FlowRunner
        flowId="job-application"
        lang={lang}
        hooks={hooks}
        manageTitle={manageTitle}
        renderStepExtra={(step) =>
          step.id === 'contact_confirm' ? (
            <>
              <ContactDetails lang={lang} answers={contact} />
              <p className="bo-hint">{t(lang, 'apply.contact_change_note')}</p>
            </>
          ) : null
        }
        renderDone={() => (
          <div className="bo-actions">
            <Button variant="secondary" onClick={onBackToJobs}>
              {t(lang, 'jobs.back_to_jobs')}
            </Button>
          </div>
        )}
      />
    </div>
  );
}

// WCAG 3.3.7: show what we already know instead of asking again.
function ContactDetails({ lang, answers }: { lang: string; answers: Record<string, Answer> }) {
  const name = answers.full_name?.value;
  const method = answers.contact_method?.value;
  const phone = answers.phone?.value;
  if (!name && !method && !phone) return null;

  return (
    <Card>
      <dl style={{ margin: 0, display: 'grid', gap: 'var(--bo-space-2)' }}>
        {typeof name === 'string' && name && (
          <div>
            <dt style={{ fontWeight: 700 }}>{t(lang, 'signup.full_name.title')}</dt>
            <dd data-bo-private="" style={{ margin: 0 }}>
              {name}
            </dd>
          </div>
        )}
        {typeof method === 'string' && method && (
          <div>
            <dt style={{ fontWeight: 700 }}>{t(lang, 'signup.contact_method.title')}</dt>
            <dd style={{ margin: 0 }}>{t(lang, `signup.contact_method.${method}`)}</dd>
          </div>
        )}
        {typeof phone === 'string' && phone && (
          <div>
            <dt style={{ fontWeight: 700 }}>{t(lang, 'signup.phone.title')}</dt>
            <dd data-bo-private="" style={{ margin: 0 }}>
              {formatEthiopianPhoneDisplay(phone)}
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
