import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { announce } from '../a11y/announce';
import { useAutoRead } from '../a11y/modes';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { errorCode, type ApiConfig } from '../api/client';
import {
  resumeLookup,
  resumeVerify,
  type ResumeDob,
  type ResumeLookupResponse,
} from '../api/registrations';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { Step } from '../engine/types';
import { DateField, type DateFieldValue } from '../fields/DateField';
import { ListenButton } from '../i18n/ReadAloud';
import { t } from '../i18n/t';

export interface ResumeScreenProps {
  api: ApiConfig;
  lang: string;
  initialToken?: string | null;
  initialCode?: string | null;
  manageTitle?: boolean;
  /** signIn: a sign-in code of a finished profile (open the profile, not the sign-up). */
  onSuccess: (session: { token: string; registrationId: string; signIn: boolean }) => void;
  onCancel?: () => void;
}

type Stage = 'code' | 'check';

const DOB_STEP: Step = {
  id: 'resume_dob',
  type: 'date',
  title: 'resume.dob_label',
  hint: 'resume.dob_hint',
  required: true,
  storage: 'answer',
  calendar_default: { am: 'ethiopian', en: 'gregorian' },
};

function normalizeCodeInput(val: string): string {
  return val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function ResumeScreen({
  api,
  lang,
  initialToken,
  initialCode,
  manageTitle = true,
  onSuccess,
  onCancel,
}: ResumeScreenProps) {
  const [stage, setStage] = useState<Stage>('code');
  const [code, setCode] = useState(() => initialCode || '');
  const [token, setToken] = useState<string | null>(() => initialToken || null);
  const [lookupResult, setLookupResult] = useState<ResumeLookupResponse | null>(null);

  // Verification inputs
  const [phoneLast4, setPhoneLast4] = useState('');
  const [dobValue, setDobValue] = useState<DateFieldValue | null>(null);

  // Status and errors
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Manage page title
  useEffect(() => {
    if (!manageTitle || typeof document === 'undefined') return;
    const baseTitle = t(lang, stage === 'code' ? 'resume.title' : 'resume.verify_title');
    document.title = `${baseTitle} | Bridge Onboarding`;
  }, [lang, stage, manageTitle]);

  // Focus heading on stage transition
  useEffect(() => {
    headingRef.current?.focus();
  }, [stage]);

  // The last step: the check (or none) → a learner session.
  const finishVerify = useCallback(
    async (body: { code?: string; token?: string; dob?: ResumeDob; phone_last4?: string }) => {
      const res = await resumeVerify(api, body);
      const signIn = res.kind === 'sign_in';
      announce(t(lang, signIn ? 'resume.success_sign_in' : 'resume.success'));
      onSuccess({
        token: res.session.token,
        registrationId: String(res.registration_id),
        signIn,
      });
    },
    [api, lang, onSuccess],
  );

  // Lookup logic
  const performLookup = useCallback(
    async (codeOrToken: { code?: string; token?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await resumeLookup(api, codeOrToken);
        if (res.check === 'none') {
          // A sign-in code with nothing to confirm (no date of birth or phone): sign in now.
          await finishVerify(codeOrToken);
          return;
        }
        setLookupResult(res);
        setStage('check');
        announce(t(lang, 'resume.verify_title'));
      } catch (err) {
        const codeErr = errorCode(err);
        setError(codeErr);
        announce(t(lang, `errors.${codeErr}`));
      } finally {
        setLoading(false);
      }
    },
    [api, lang, finishVerify],
  );

  // If launched with an initial token (from /r/<token>), look it up immediately
  const autoCheckedToken = useRef(false);
  useEffect(() => {
    if (autoCheckedToken.current) return;
    if (initialToken) {
      autoCheckedToken.current = true;
      void performLookup({ token: initialToken });
    } else if (initialCode) {
      autoCheckedToken.current = true;
      void performLookup({ code: normalizeCodeInput(initialCode) });
    }
  }, [initialToken, initialCode, performLookup]);

  // Handle code submission
  const handleCodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeCodeInput(code);
    if (!clean) {
      setError('required');
      codeInputRef.current?.focus();
      return;
    }
    void performLookup({ code: clean });
  };

  // Handle verification submission
  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!lookupResult) return;

    setError(null);

    let verifyDob: ResumeDob | undefined;
    let verifyPhone: string | undefined;

    if (lookupResult.check === 'phone') {
      const cleanDigits = phoneLast4.replace(/\D/g, '');
      if (cleanDigits.length !== 4) {
        setError('last4_invalid');
        phoneInputRef.current?.focus();
        return;
      }
      verifyPhone = cleanDigits;
    } else if (lookupResult.check === 'dob') {
      if (!dobValue) {
        setError('required');
        return;
      }
      if (dobValue.calendar === 'ethiopian' && dobValue.ethiopian) {
        verifyDob = {
          calendar: 'ethiopian',
          year: dobValue.ethiopian.year,
          month: dobValue.ethiopian.month,
          day: dobValue.ethiopian.day,
        };
      } else if (dobValue.iso) {
        const [y, m, d] = dobValue.iso.split('-').map(Number);
        if (!y || !m || !d) {
          setError('date_invalid');
          return;
        }
        verifyDob = {
          calendar: 'gregorian',
          year: y,
          month: m,
          day: d,
        };
      } else {
        setError('date_invalid');
        return;
      }
    }

    setLoading(true);
    try {
      const cleanCode = code ? normalizeCodeInput(code) : undefined;
      await finishVerify({
        code: cleanCode,
        token: token ?? undefined,
        dob: verifyDob,
        phone_last4: verifyPhone,
      });
    } catch (err) {
      const codeErr = errorCode(err);
      setError(codeErr);
      announce(t(lang, `errors.${codeErr}`));
    } finally {
      setLoading(false);
    }
  };

  const readParts = useMemo((): Part[] => {
    if (stage === 'code') {
      return [keyPart(lang, 'resume.title'), keyPart(lang, 'resume.explanation')];
    }
    if (lookupResult?.check === 'phone') {
      return [keyPart(lang, 'resume.verify_title'), keyPart(lang, 'resume.phone_hint')];
    }
    return [keyPart(lang, 'resume.verify_title'), keyPart(lang, 'resume.dob_hint')];
  }, [stage, lookupResult?.check, lang]);

  useAutoRead(`resume-${stage}`, () => readParts, lang);

  return (
    <Card className="bo-resume-screen" style={{ margin: '0 auto', maxWidth: '36em' }}>
      {stage === 'code' ? (
        <form onSubmit={handleCodeSubmit}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 tabIndex={-1} ref={headingRef} style={{ margin: '0 0 var(--bo-space-2) 0' }}>
              {t(lang, 'resume.title')}
            </h1>
            <ListenButton lang={lang} parts={() => readParts} />
          </div>

          <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-4) 0' }}>
            {t(lang, 'resume.explanation')}
          </p>

          {error && (
            <p
              role="alert"
              style={{
                margin: '0 0 var(--bo-space-3) 0',
                color: 'var(--bo-error)',
                fontWeight: 600,
              }}
            >
              <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
              {t(lang, `errors.${error}`)}
            </p>
          )}

          <div style={{ marginBottom: 'var(--bo-space-4)' }}>
            <label
              htmlFor="resume-code-input"
              style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--bo-space-2)' }}
            >
              {t(lang, 'resume.code_label')}
            </label>
            <input
              id="resume-code-input"
              ref={codeInputRef}
              type="text"
              name="resume_code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck="false"
              placeholder={t(lang, 'resume.code_placeholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              style={{
                fontSize: '1.25em',
                letterSpacing: '0.15em',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                width: '100%',
                maxWidth: '14em',
                padding: 'var(--bo-space-2) var(--bo-space-3)',
                borderRadius: 'var(--bo-radius)',
                border: '2px solid var(--bo-border-strong)',
              }}
            />
            <p className="bo-hint" style={{ margin: 'var(--bo-space-1) 0 0 0' }}>
              {t(lang, 'resume.code_hint')}
            </p>
          </div>

          <div className="bo-actions">
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? t(lang, 'resume.loading_lookup') : t(lang, 'resume.lookup_button')}
            </Button>
            {onCancel && (
              <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
                {t(lang, 'resume.start_new')}
              </Button>
            )}
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifySubmit}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 tabIndex={-1} ref={headingRef} style={{ margin: '0 0 var(--bo-space-2) 0' }}>
              {t(lang, 'resume.verify_title')}
            </h1>
            <ListenButton lang={lang} parts={() => readParts} />
          </div>

          <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-4) 0' }}>
            {lookupResult?.check === 'phone'
              ? t(lang, 'resume.phone_hint')
              : t(lang, 'resume.dob_hint')}
          </p>

          {error && (
            <p
              role="alert"
              style={{
                margin: '0 0 var(--bo-space-3) 0',
                color: 'var(--bo-error)',
                fontWeight: 600,
              }}
            >
              <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
              {t(lang, `errors.${error}`)}
            </p>
          )}

          {lookupResult?.check === 'phone' && (
            <div style={{ marginBottom: 'var(--bo-space-4)' }}>
              <label
                htmlFor="resume-phone-last4"
                style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--bo-space-2)' }}
              >
                {t(lang, 'resume.phone_label')}
              </label>
              <input
                id="resume-phone-last4"
                ref={phoneInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
                placeholder="1234"
                value={phoneLast4}
                onChange={(e) => setPhoneLast4(e.target.value)}
                disabled={loading}
                style={{
                  fontSize: '1.25em',
                  letterSpacing: '0.2em',
                  fontFamily: 'monospace',
                  width: '6em',
                  padding: 'var(--bo-space-2) var(--bo-space-3)',
                  borderRadius: 'var(--bo-radius)',
                  border: '2px solid var(--bo-border-strong)',
                }}
              />
            </div>
          )}

          {lookupResult?.check === 'dob' && (
            <div style={{ marginBottom: 'var(--bo-space-4)' }}>
              <DateField
                step={DOB_STEP}
                lang={lang}
                value={dobValue}
                onChange={(v) => setDobValue(v)}
                error={error === 'date_invalid' ? 'date_invalid' : undefined}
              />
            </div>
          )}

          <div className="bo-actions">
            <Button variant="primary" type="submit" disabled={loading}>
              {loading
                ? t(lang, 'resume.loading_verify')
                : t(
                    lang,
                    lookupResult?.kind === 'sign_in'
                      ? 'resume.sign_in_button'
                      : 'resume.verify_button',
                  )}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setStage('code');
                setToken(null);
                setError(null);
              }}
              disabled={loading}
            >
              {t(lang, 'resume.back_to_code')}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
