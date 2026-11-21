import { useCallback, useEffect, useState } from 'react';
import { announce } from '../a11y/announce';
import { keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { loadSession } from '../api/auth';
import { errorCode, type ApiConfig } from '../api/client';
import { getSignInCode, newSignInCode } from '../api/me';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { ListenButton } from '../i18n/ReadAloud';
import { t } from '../i18n/t';

export interface SignInCodeCardProps {
  /** The partner's API settings (the learner token is read from this device). */
  api: ApiConfig;
  lang: string;
  /** The profile page also offers a new code (the old one stops working). */
  allowNew?: boolean;
}

type State =
  | { name: 'loading' }
  | { name: 'ready'; code: string }
  | { name: 'not_ready' } // the sign-up hasn't reached the server yet (offline)
  | { name: 'error' };

/**
 * "Your sign-in code": the code (XXXX-XXXX) a learner who finished signing up types in
 * "Continue with a code" on another phone, with their date of birth, to open their profile.
 * Shown on the Done screen and on the profile page. The code is personal: read aloud by the
 * device voice only, letter by letter.
 */
export function SignInCodeCard({ api, lang, allowNew = false }: SignInCodeCardProps) {
  const [state, setState] = useState<State>({ name: 'loading' });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renewed, setRenewed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const learnerApi = useCallback(async (): Promise<ApiConfig | null> => {
    const s = await loadSession().catch(() => null);
    return s ? { ...api, token: s.token } : null;
  }, [api]);

  useEffect(() => {
    let active = true;
    setState({ name: 'loading' });
    void (async () => {
      const cfg = await learnerApi();
      if (!cfg) {
        if (active) setState({ name: 'not_ready' });
        return;
      }
      try {
        const res = await getSignInCode(cfg);
        if (active) setState({ name: 'ready', code: res.code });
      } catch (err) {
        if (!active) return;
        const code = errorCode(err);
        setState(
          code === 'not_registered' || code === 'network'
            ? { name: 'not_ready' }
            : { name: 'error' },
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [learnerApi, attempt]);

  const copy = async () => {
    if (state.name !== 'ready') return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      announce(t(lang, 'signin_code.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code stays on the screen to copy by hand.
    }
  };

  const makeNew = async () => {
    const cfg = await learnerApi();
    if (!cfg) return;
    setBusy(true);
    try {
      const res = await newSignInCode(cfg);
      setState({ name: 'ready', code: res.code });
      setRenewed(true);
      announce(t(lang, 'signin_code.new_done'));
    } catch {
      setState({ name: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const codeParts = (): Part[] =>
    state.name === 'ready'
      ? [
          keyPart(lang, 'signin_code.title'),
          // The code itself: one character at a time, device voice only (personal).
          { text: state.code.replace('-', '').split('').join(', '), personal: true },
        ]
      : [keyPart(lang, 'signin_code.title')];

  return (
    <section
      aria-labelledby="bo-signin-code-title"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--bo-space-3)',
        padding: 'var(--bo-space-4)',
        border: '2px solid var(--bo-border-strong)',
        borderRadius: 'var(--bo-radius)',
        background: 'var(--bo-surface)',
      }}
    >
      <h2 id="bo-signin-code-title" style={{ fontSize: '1.1em', margin: 0 }}>
        {t(lang, 'signin_code.title')}
      </h2>
      <p style={{ margin: 0 }}>{t(lang, 'signin_code.body')}</p>

      {state.name === 'loading' && <p style={{ margin: 0 }}>{t(lang, 'signin_code.loading')}</p>}

      {state.name === 'ready' && (
        <>
          {renewed && (
            <Banner variant="success" quiet>
              {t(lang, 'signin_code.new_done')}
            </Banner>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9em', marginBottom: 'var(--bo-space-1)' }}>
              {t(lang, 'signin_code.label')}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--bo-space-2)',
                flexWrap: 'wrap',
              }}
            >
              <span
                data-bo-private=""
                style={{
                  fontSize: '1.4em',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  letterSpacing: '0.12em',
                  background: 'var(--bo-bg)',
                  padding: 'var(--bo-space-1) var(--bo-space-2)',
                  borderRadius: 'var(--bo-radius)',
                  border: '1px solid var(--bo-border)',
                }}
              >
                {state.code}
              </span>
              <Button variant="secondary" onClick={() => void copy()}>
                {copied ? t(lang, 'signin_code.copied') : t(lang, 'signin_code.copy')}
              </Button>
              <ListenButton lang={lang} parts={codeParts} label={t(lang, 'signin_code.listen')} />
            </div>
          </div>
          {allowNew && (
            <div>
              <p className="bo-hint" style={{ margin: '0 0 var(--bo-space-2) 0' }}>
                {t(lang, 'signin_code.new_hint')}
              </p>
              <Button variant="secondary" onClick={() => void makeNew()} disabled={busy}>
                {busy ? t(lang, 'common.sending') : t(lang, 'signin_code.new')}
              </Button>
            </div>
          )}
        </>
      )}

      {(state.name === 'not_ready' || state.name === 'error') && (
        <>
          <Banner variant={state.name === 'error' ? 'error' : 'info'} quiet>
            {t(lang, state.name === 'error' ? 'signin_code.error' : 'signin_code.not_ready')}
          </Banner>
          <div>
            <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t(lang, 'common.try_again')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
