import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { announce } from '../a11y/announce';
import {
  clearSession,
  forgetEverything,
  loadSession,
  markRegistered,
  saveSession,
  type LearnerSession,
} from '../api/auth';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import type { WidgetConfig } from '../api/config';
import {
  createRegistration,
  getRegistration,
  patchRegistration,
  postConsent,
  putSupportRequest,
  submit,
  type Answer,
} from '../api/registrations';
import {
  FlowRunner,
  useFlowEngine,
  type FlowHooks,
  type SubmitOutcome,
} from '../engine/FlowRunner';
import { nextStepId } from '../engine/next';
import type { AnswerState, Step } from '../engine/types';
import { isValueEmpty } from '../engine/validate';
import { t } from '../i18n/t';
import type { FileValue } from '../lib/image';
import { enqueue, moveOutbox, pendingCount } from '../offline/outbox';
import { loadSnapshot, saveNeeds, saveSnapshot } from '../offline/snapshot';
import { syncOutbox } from '../offline/sync';
import { PhoneLink, TelegramLink, type HelpContacts } from '../shell/HelpPanel';
import { LOCAL_OUTBOX } from '../shell/StatusBar';
import { Button } from '../components/Button';
import { transcribeClip } from '../voice/transcribeClip';
import type { WidgetEvent } from './emit';

export interface SignupFlowProps {
  api: ApiConfig; // origin + partner key, no token
  lang: string;
  simple: boolean;
  config: WidgetConfig | null;
  /** Ask GET /config again (the organisations list didn't load). */
  onReloadConfig?: () => void;
  manageTitle: boolean;
  emit: (name: WidgetEvent, detail?: object) => void;
  /** The learner session changed (created, restored or dropped). */
  onSession: (session: LearnerSession | null) => void;
  /** Something was queued or sent: the status bar should look again. */
  onSaveState: () => void;
  onCompleted?: (learnerId: string) => void;
  /** Extra content on the Done screen (e.g. back to a job application). */
  doneExtra?: ReactNode;
  /** Offer "Continue on another device" from the welcome screen. */
  onResume?: () => void;
}

interface FlushResult {
  ok: boolean;
  code?: string;
}

/** Sign-up (flow="signup"): the form engine plus saving on the phone and to the account. */
export function SignupFlow({
  api,
  lang,
  simple,
  config,
  onReloadConfig,
  manageTitle,
  emit,
  onSession,
  onSaveState,
  onCompleted,
  doneExtra,
  onResume,
}: SignupFlowProps) {
  const engine = useFlowEngine('signup');
  const [state, dispatch] = engine;
  const [referralOrg, setReferralOrg] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const langRef = useRef(lang);
  langRef.current = lang;
  const simpleRef = useRef(simple);
  simpleRef.current = simple;
  const propsRef = useRef({ emit, onSession, onSaveState, onCompleted });
  propsRef.current = { emit, onSession, onSaveState, onCompleted };

  const sessionRef = useRef<LearnerSession | null>(null);
  const versionsRef = useRef<Record<string, number>>({}); // server version per step = next base_version
  const metaRef = useRef({ consentPending: false, supportDirty: false });
  const startedRef = useRef(false); // the person pressed Continue on Welcome (or came back)
  const loadedRef = useRef(false); // the saved state has been read; snapshots may be written
  const creatingRef = useRef<Promise<LearnerSession | null> | null>(null);
  const createErrorRef = useRef<string>('network');
  const flushRef = useRef<Promise<FlushResult> | null>(null);
  const flushAgainRef = useRef(false);

  const learnerApi = useCallback(
    (s: LearnerSession): ApiConfig => ({ ...api, token: s.token }),
    [api],
  );

  const stepTitle = (stepId: string) => {
    const step = stateRef.current.flow.steps.find((s) => s.id === stepId);
    return step ? t(langRef.current, step.title) : stepId;
  };

  const setSession = useCallback((s: LearnerSession | null) => {
    sessionRef.current = s;
    propsRef.current.onSession(s);
  }, []);

  const persistSnapshot = useCallback(() => {
    if (!loadedRef.current) return;
    const s = stateRef.current;
    void saveSnapshot({
      currentStep: s.currentId,
      answers: s.answers,
      ...metaRef.current,
    }).catch(() => {});
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Registration and sync                                            */
  /* ---------------------------------------------------------------- */

  const ensureSession = useCallback(async (): Promise<LearnerSession | null> => {
    if (sessionRef.current) return sessionRef.current;
    if (!creatingRef.current) {
      creatingRef.current = (async () => {
        try {
          const res = await createRegistration(api, {
            flow_id: 'signup',
            language: langRef.current,
            simple_mode: simpleRef.current,
          });
          const s: LearnerSession = {
            token: res.session.token,
            registrationId: res.registration_id,
            learnerId: res.learner_id,
          };
          await saveSession(s.token, s.registrationId, s.learnerId).catch(() => {});
          setSession(s);
          return s;
        } catch (err) {
          const code = errorCode(err);
          createErrorRef.current = code;
          if (code !== 'network') propsRef.current.emit('error', { code });
          return null;
        } finally {
          creatingRef.current = null;
        }
      })();
    }
    return creatingRef.current;
  }, [api, setSession]);

  const supportPayload = () => {
    const answers = stateRef.current.answers;
    const needs = answers.support_needs?.value;
    const other = answers.support_other?.value;
    const share = answers.support_share?.value;
    const shareList = Array.isArray(share) ? (share as string[]) : [];
    return {
      needs: Array.isArray(needs) ? (needs as string[]) : [],
      other_text: typeof other === 'string' ? other.trim() : '',
      share_with: {
        courses: shareList.includes('courses'),
        employers: shareList.includes('employers'),
      },
    };
  };

  const runFlush = useCallback(async (): Promise<FlushResult> => {
    if (!sessionRef.current && !startedRef.current) return { ok: true };
    const s = await ensureSession();
    if (!s) return { ok: false, code: createErrorRef.current };
    const cfg = learnerApi(s);
    let code: string | undefined;

    // Answers given before the registration existed
    await moveOutbox(LOCAL_OUTBOX, s.registrationId).catch(() => {});

    if (metaRef.current.consentPending) {
      try {
        await postConsent(cfg, s.registrationId, 'data_processing', true, 'tap');
        metaRef.current.consentPending = false;
      } catch (err) {
        code = errorCode(err);
        // A refusal (not a network problem) won't get better by sending it again.
        if (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) {
          return { ok: false, code };
        }
        metaRef.current.consentPending = false;
      }
    }

    const result = await syncOutbox(
      cfg,
      s.registrationId,
      (stepId, current) => {
        if (!current) return; // already submitted: nothing to adopt
        versionsRef.current[stepId] = current.version;
        dispatch({
          type: 'SYNCED',
          stepId,
          version: current.version,
          value: current.value,
          inputMethod: current.input_method,
        });
        announce(`${stepTitle(stepId)}: ${t(langRef.current, 'errors.answer_conflict')}`);
      },
      {
        baseVersion: (stepId) => versionsRef.current[stepId],
        onSynced: (stepId, answer: Answer, superseded) => {
          versionsRef.current[stepId] = answer.version;
          if (!superseded) {
            dispatch({
              type: 'SYNCED',
              stepId,
              version: answer.version,
              value: answer.value,
              inputMethod: answer.input_method,
            });
          }
        },
        onRejected: (stepId, rejectCode) => {
          announce(`${stepTitle(stepId)}: ${t(langRef.current, `errors.${rejectCode}`)}`);
        },
      },
    );
    if (result.synced > 0) propsRef.current.emit('saved', { where: 'server' });

    if (metaRef.current.supportDirty) {
      try {
        await putSupportRequest(cfg, s.registrationId, supportPayload());
        metaRef.current.supportDirty = false;
        propsRef.current.emit('support-requested', {});
      } catch (err) {
        code = errorCode(err);
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          metaRef.current.supportDirty = false; // refused: sending again won't help
          announce(t(langRef.current, `errors.${code}`));
        }
      }
    }

    persistSnapshot();
    propsRef.current.onSaveState();
    const left = await pendingCount(s.registrationId).catch(() => 0);
    const ok = left === 0 && !metaRef.current.consentPending && !metaRef.current.supportDirty;
    return ok ? { ok } : { ok, code: code ?? 'network' };
  }, [ensureSession, learnerApi, dispatch, persistSnapshot]);

  // One flush at a time; a request during a flush runs once more afterwards.
  const flush = useCallback((): Promise<FlushResult> => {
    if (flushRef.current) {
      flushAgainRef.current = true;
      return flushRef.current;
    }
    const p = (async () => {
      let res: FlushResult;
      do {
        flushAgainRef.current = false;
        res = await runFlush().catch(() => ({ ok: false, code: 'internal_error' }));
      } while (flushAgainRef.current);
      return res;
    })();
    flushRef.current = p;
    void p.finally(() => {
      if (flushRef.current === p) flushRef.current = null;
    });
    return p;
  }, [runFlush]);

  /* ---------------------------------------------------------------- */
  /*  Start: saved answers on this phone, then the account             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, snap] = await Promise.all([
        loadSession().catch(() => null),
        loadSnapshot().catch(() => null),
      ]);
      if (cancelled) return;

      const untouched = () =>
        stateRef.current.history.length === 0 &&
        stateRef.current.currentId === stateRef.current.flow.start &&
        Object.keys(stateRef.current.answers).length === 0;

      if (snap) {
        metaRef.current = {
          consentPending: !!snap.consentPending,
          supportDirty: !!snap.supportDirty,
        };
        for (const [id, a] of Object.entries(snap.answers)) {
          if (a.synced) versionsRef.current[id] = a.version;
        }
        if (untouched()) {
          dispatch({ type: 'RESTORE', answers: snap.answers, currentStep: snap.currentStep });
        }
        startedRef.current = true;
      }
      loadedRef.current = true;

      if (!stored) {
        if (snap) void flush();
        return;
      }
      setSession(stored);
      startedRef.current = true;

      try {
        const reg = await getRegistration(learnerApi(stored), stored.registrationId);
        if (cancelled) return;
        const merged: Record<string, AnswerState> = { ...stateRef.current.answers };
        for (const [id, a] of Object.entries(reg.answers ?? {})) {
          versionsRef.current[id] = a.version;
          const local = merged[id];
          if (local && !local.synced) continue; // a newer answer from this phone is waiting
          merged[id] = {
            value: a.value,
            version: a.version,
            inputMethod: a.input_method,
            synced: true,
          };
        }
        const submitted = reg.status === 'submitted';
        if (submitted) void markRegistered(true);
        const step = submitted
          ? 'done'
          : snap || !untouched()
            ? stateRef.current.currentId
            : reg.current_step || stateRef.current.currentId;
        dispatch({ type: 'RESTORE', answers: merged, currentStep: step });
      } catch (err) {
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
          // The saved session is no longer valid: start again on this phone.
          await clearSession().catch(() => {});
          await forgetEverything().catch(() => {});
          if (cancelled) return;
          setSession(null);
          startedRef.current = false;
          versionsRef.current = {};
          metaRef.current = { consentPending: false, supportDirty: false };
          dispatch({ type: 'RESTORE', answers: {}, currentStep: stateRef.current.flow.start });
          return;
        }
        // Offline or server trouble: carry on with what this phone has.
      }
      void flush();
    })();
    return () => {
      cancelled = true;
    };
    // Once, on start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the copy on this phone up to date.
  useEffect(() => {
    persistSnapshot();
  }, [state.answers, state.currentId, persistSnapshot]);

  // Send waiting answers when the connection comes back, and every 30 seconds.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (navigator.onLine && (sessionRef.current || startedRef.current)) void flush();
    }, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [flush]);

  // Language or Simple mode changed: remember it on the account (best effort).
  const firstPrefs = useRef(true);
  useEffect(() => {
    if (firstPrefs.current) {
      firstPrefs.current = false;
      return;
    }
    const s = sessionRef.current;
    if (!s) return;
    void patchRegistration(learnerApi(s), s.registrationId, {
      language: lang,
      simple_mode: simple,
    }).catch(() => {});
  }, [lang, simple, learnerApi]);

  /* ---------------------------------------------------------------- */
  /*  Engine hooks                                                     */
  /* ---------------------------------------------------------------- */

  const hooks = useMemo<FlowHooks>(
    () => ({
      onLeaveStep: (step: Step, value, inputMethod, before) => {
        if (step.id === before.flow.start) {
          startedRef.current = true;
          void flush(); // creates the registration (POST /registrations)
          return;
        }
        if (step.type === 'consent') {
          if (value === true) {
            metaRef.current.consentPending = true;
            persistSnapshot();
            void flush();
          }
          return;
        }
        if (step.storage === 'answer') {
          // A photo already sent comes back as its name only: nothing new to send.
          if (step.type === 'file' && value && !(value as Partial<FileValue>).data) return;
          const previous = before.answers[step.id]?.value;
          const neverSaved = versionsRef.current[step.id] === undefined;
          if (isValueEmpty(value) && neverSaved && isValueEmpty(previous)) return;
          const key = sessionRef.current?.registrationId ?? LOCAL_OUTBOX;
          void enqueue(key, step.id, value, inputMethod, versionsRef.current[step.id] ?? 0)
            .then(() => {
              propsRef.current.emit('saved', { where: 'device' });
              propsRef.current.onSaveState();
              return flush();
            })
            .catch(() => {});
          return;
        }
        if (step.storage === 'support') {
          if (step.id === 'support_needs') {
            void saveNeeds(Array.isArray(value) ? (value as string[]) : []).catch(() => {});
          }
          // Send the support request once, when leaving the last support step (or a Change).
          const nextId = nextStepId(before.flow, step.id, before.answers);
          const next = before.flow.steps.find((s) => s.id === nextId);
          const lastSupport = before.returnTo || !next || next.storage !== 'support';
          if (lastSupport) {
            metaRef.current.supportDirty = true;
            persistSnapshot();
            void flush();
          }
        }
      },

      onStepChange: (step, progress) => {
        propsRef.current.emit('step-changed', {
          step: step.id,
          index: progress.n,
          total: progress.total,
        });
        const s = sessionRef.current;
        if (s && step.type !== 'done') {
          void patchRegistration(learnerApi(s), s.registrationId, {
            current_step: step.id,
          }).catch(() => {});
        }
      },

      onSubmit: async (): Promise<SubmitOutcome> => {
        startedRef.current = true;
        const flushed = await flush();
        const s = sessionRef.current;
        if (!flushed.ok || !s) return { ok: false, code: flushed.code ?? 'network' };
        try {
          const res = await submit(learnerApi(s), s.registrationId);
          void markRegistered(true);
          if (res.learner_id && res.learner_id !== s.learnerId) {
            const updated = { ...s, learnerId: res.learner_id };
            void saveSession(updated.token, updated.registrationId, updated.learnerId);
            setSession(updated);
          }
          setReferralOrg(res.referral?.partner_name ?? null);
          propsRef.current.emit('completed', {
            registration_id: s.registrationId,
            learner_id: res.learner_id,
          });
          propsRef.current.onCompleted?.(res.learner_id);
          return { ok: true };
        } catch (err) {
          const code = errorCode(err);
          propsRef.current.emit('error', { code });
          if (err instanceof ApiError && err.status === 422) {
            return { ok: false, code, fields: err.errors };
          }
          return { ok: false, code };
        }
      },

      onVoiceClip: async (clipId, step) => {
        const s = await ensureSession();
        const res = s
          ? await transcribeClip(learnerApi(s), clipId, step, langRef.current)
          : { code: createErrorRef.current };
        if ('text' in res) return res; // with `provider`: "mock" is the test voice service
        announce(t(langRef.current, `errors.${res.code}`));
        if (res.code !== 'speech_unclear') propsRef.current.emit('error', { code: res.code });
        return res;
      },

      onSpeechConsent: (granted) => {
        const s = sessionRef.current;
        if (!s) return;
        void postConsent(learnerApi(s), s.registrationId, 'cloud_speech', granted, 'tap').catch(
          () => {},
        );
      },
    }),
    [flush, ensureSession, learnerApi, persistSnapshot, setSession],
  );

  return (
    <FlowRunner
      flowId="signup"
      lang={lang}
      engine={engine}
      hooks={hooks}
      referralPartners={config?.referral_partners}
      manageTitle={manageTitle}
      referralOrg={referralOrg}
      renderStepExtra={(step) =>
        step.id === 'welcome' && onResume ? (
          <div style={{ marginTop: 'var(--bo-space-3)' }}>
            <Button variant="link" onClick={onResume}>
              {t(lang, 'resume.continue_existing')}
            </Button>
          </div>
        ) : null
      }
      renderDone={() => doneExtra}
      renderNoOptions={(step) =>
        step.options_from === 'config:referral_partners' ? (
          <NoReferralOptions lang={lang} help={config?.help} onRetry={onReloadConfig} />
        ) : null
      }
    />
  );
}

/**
 * "Which organisation can help you?" with no organisation to show (GET /config failed, or the
 * partner has none): not a dead end. Say so, try loading again, and give the help contacts;
 * Back (above) leads to the other ways to sign up.
 */
function NoReferralOptions({
  lang,
  help,
  onRetry,
}: {
  lang: string;
  help?: HelpContacts | null;
  onRetry?: () => void;
}) {
  const phone = help?.phone?.trim();
  const telegram = help?.telegram?.trim();

  // Try once more as soon as this question shows: the list may have failed earlier.
  useEffect(() => {
    onRetry?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
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
      <p style={{ margin: 0, fontWeight: 600 }}>{t(lang, 'signup.referral_partner.empty')}</p>
      {phone && (
        <p style={{ margin: 0 }}>
          <strong>{t(lang, 'help_panel.phone')}</strong> <PhoneLink phone={phone} lang={lang} />
        </p>
      )}
      {telegram && (
        <p style={{ margin: 0 }}>
          <strong>{t(lang, 'help_panel.telegram')}</strong> <TelegramLink telegram={telegram} />
        </p>
      )}
      {onRetry && (
        <div>
          <Button variant="secondary" onClick={onRetry}>
            {t(lang, 'common.try_again')}
          </Button>
        </div>
      )}
    </div>
  );
}
