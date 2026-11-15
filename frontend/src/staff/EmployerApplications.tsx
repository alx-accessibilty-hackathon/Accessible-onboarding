import needsVocab from '@shared/vocab/needs.json';
import { useEffect, useRef, useState } from 'react';
import { useAutoRead } from '../a11y/modes';
import { formatDate, spellDigits } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import { fetchJobApplications, type JobApplication } from '../api/employer';
import type { Job } from '../careers/match';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { getFlow } from '../engine/FlowRunner';
import type { Step } from '../engine/types';
import { ListenButton } from '../i18n/ReadAloud';
import { languageName } from '../i18n/registry';
import { t } from '../i18n/t';
import { gregorianToEthiopian, type DateAnswerValue } from '../lib/ethiopianCalendar';
import { formatEthiopianPhoneDisplay } from '../lib/phone';
import { formatAnswerValue } from '../screens/CheckAnswers';
import { PhoneLink } from '../shell/HelpPanel';

export interface EmployerApplicationsProps {
  job: Job;
  api: ApiConfig; // with the staff token
  lang: string;
  onBack: () => void;
  onUnauthorized: () => void;
}

const applicationSteps: Step[] = (getFlow('job-application')?.steps ?? []).filter(
  (s) => !['info', 'consent', 'check_answers', 'done'].includes(s.type),
);

function formatDay(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** An answer in plain words ("Yes", "15 Meskerem 2017", the text they wrote). */
function answerText(step: Step, value: unknown, lang: string): string {
  if (step.type === 'date' && value && typeof value === 'object' && 'iso' in value) {
    const date = value as DateAnswerValue;
    if (!date.iso) return '—';
    const [y, m, d] = date.iso.split('-').map(Number);
    return formatDate(
      { ...date, ethiopian: date.ethiopian ?? gregorianToEthiopian(y, m, d) },
      lang,
    );
  }
  return formatAnswerValue(step, value, lang);
}

function applicantName(a: JobApplication): string {
  const { preferred_name: preferred, full_name: full } = a.applicant;
  if (preferred && full && preferred !== full) return `${preferred} (${full})`;
  return preferred || full || '—';
}

function needLabel(code: string, lang: string): string {
  const item = needsVocab.items.find((n) => n.code === code);
  return item ? t(lang, item.learner) : code;
}

// Applications to one of the employer's jobs: who applied, how to reach them, their answers,
// and what would help them only when they chose to share it with this application.
export function EmployerApplications({
  job,
  api,
  lang,
  onBack,
  onUnauthorized,
}: EmployerApplicationsProps) {
  const [items, setItems] = useState<JobApplication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    fetchJobApplications(api, job.id)
      .then((list) => {
        if (active) setItems(list);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setLoadError(errorCode(err));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, job.id, reload]);

  const title = t(lang, 'staff.applications_title', { title: job.title });
  const countText = items ? t(lang, 'staff.applications_count', { count: items.length }) : '';

  // An applicant's name, phone, answers and needs are theirs: device voice only.
  const itemParts = (a: JobApplication): Part[] => {
    const parts: Part[] = [
      { text: applicantName(a), personal: true },
      t(lang, 'staff.contact_how'),
      a.applicant.contact_method
        ? t(lang, `signup.contact_method.${a.applicant.contact_method}`)
        : '—',
    ];
    if (a.applicant.phone) {
      parts.push(t(lang, 'staff.phone'), {
        text: spellDigits(formatEthiopianPhoneDisplay(a.applicant.phone)),
        personal: true,
      });
    }
    parts.push(t(lang, 'staff.applied_on'), formatDay(a.created_at, lang));
    parts.push(t(lang, 'staff.their_answers'));
    for (const step of applicationSteps) {
      const answer = a.answers?.[step.id];
      if (!answer) continue;
      parts.push(t(lang, step.title), {
        text: answerText(step, answer.value, lang),
        personal: true,
      });
    }
    if (a.support) {
      parts.push(t(lang, 'staff.support_title'), t(lang, 'staff.support_shared_note'));
      for (const code of a.support.needs)
        parts.push({ text: needLabel(code, lang), personal: true });
      if (a.support.other_text) parts.push({ text: a.support.other_text, personal: true });
    }
    return parts;
  };
  const listParts = (): Part[] => [
    title,
    items && items.length === 0 ? t(lang, 'staff.no_applications') : countText,
  ];
  useAutoRead(
    items
      ? `staff-applications:${job.id}`
      : loadError
        ? `staff-applications-error:${job.id}`
        : null,
    () => (loadError ? [title, t(lang, `errors.${loadError}`)] : listParts()),
    lang,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <div>
        <button type="button" className="bo-link" onClick={onBack}>
          <span aria-hidden="true">← </span>
          {t(lang, 'staff.back_to_jobs')}
        </button>
      </div>

      <h1 tabIndex={-1} ref={headingRef} style={{ margin: 0, fontSize: '1.5em' }}>
        {title}
      </h1>

      {loadError && (
        <Banner variant="error">
          <p style={{ margin: '0 0 var(--bo-space-2) 0' }}>{t(lang, `errors.${loadError}`)}</p>
          <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
            {t(lang, 'common.try_again')}
          </Button>
        </Banner>
      )}

      {!items && !loadError && <p>{t(lang, 'common.loading')}</p>}

      {items && (
        <>
          <div className="bo-actions">
            <p style={{ margin: 0, fontWeight: 700 }}>
              {items.length === 0 ? t(lang, 'staff.no_applications') : countText}
            </p>
            {items.length > 0 && (
              <ListenButton
                lang={lang}
                parts={() => [...listParts(), ...items.flatMap((a) => itemParts(a))]}
                label={t(lang, 'staff.read_all')}
                stopOnFocusMove
              />
            )}
          </div>

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--bo-space-4)',
            }}
          >
            {items.map((a) => (
              <li key={a.id}>
                <Card
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}
                >
                  <h2 data-bo-private="" style={{ margin: 0, fontSize: '1.2em' }}>
                    {applicantName(a)}
                  </h2>
                  <dl style={{ margin: 0, display: 'grid', gap: 'var(--bo-space-2)' }}>
                    <div>
                      <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.contact_how')}</dt>
                      <dd style={{ margin: 0 }}>
                        {a.applicant.contact_method
                          ? t(lang, `signup.contact_method.${a.applicant.contact_method}`)
                          : '—'}
                      </dd>
                    </div>
                    {a.applicant.phone && (
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.phone')}</dt>
                        <dd data-bo-private="" style={{ margin: 0 }}>
                          <PhoneLink
                            phone={formatEthiopianPhoneDisplay(a.applicant.phone)}
                            lang={lang}
                          />
                        </dd>
                      </div>
                    )}
                    {a.applicant.language && (
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.language')}</dt>
                        <dd style={{ margin: 0 }} lang={a.applicant.language}>
                          {languageName(a.applicant.language)}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.applied_on')}</dt>
                      <dd style={{ margin: 0 }}>{formatDay(a.created_at, lang)}</dd>
                    </div>
                  </dl>

                  <h3 style={{ margin: 0, fontSize: '1.05em' }}>
                    {t(lang, 'staff.their_answers')}
                  </h3>
                  <dl style={{ margin: 0, display: 'grid', gap: 'var(--bo-space-2)' }}>
                    {applicationSteps
                      .filter((step) => a.answers?.[step.id])
                      .map((step) => (
                        <div key={step.id}>
                          <dt style={{ fontWeight: 700 }}>{t(lang, step.title)}</dt>
                          <dd data-bo-private="" style={{ margin: 0, whiteSpace: 'pre-line' }}>
                            {answerText(step, a.answers[step.id].value, lang)}
                          </dd>
                        </div>
                      ))}
                  </dl>

                  {a.support && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--bo-space-2)',
                        padding: 'var(--bo-space-3)',
                        background: 'var(--bo-info-bg)',
                        borderRadius: 'var(--bo-radius)',
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: '1.05em' }}>
                        {t(lang, 'staff.support_title')}
                      </h3>
                      <p className="bo-hint">{t(lang, 'staff.support_shared_note')}</p>
                      {a.support.needs.length > 0 && (
                        <ul data-bo-private="" style={{ margin: 0, paddingInlineStart: '1.2em' }}>
                          {a.support.needs.map((code) => (
                            <li key={code}>{needLabel(code, lang)}</li>
                          ))}
                        </ul>
                      )}
                      {a.support.other_text && (
                        <p data-bo-private="" style={{ margin: 0 }}>
                          <strong>{t(lang, 'staff.support_other_label')}</strong>{' '}
                          {a.support.other_text}
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
