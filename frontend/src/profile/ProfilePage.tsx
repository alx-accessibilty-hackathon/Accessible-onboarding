// "My profile" (flow="profile", requirement Q4): see, change and delete my data.
// GET /me shows the details; each Change opens the same question screen as sign-up (same field
// components, validation, error summary, Read aloud and voice) and saves with PATCH /me, or with
// PUT …/support-request for what would help. "Delete my data" confirms first, then DELETE /me
// and everything kept on this device is cleared.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { announce } from '../a11y/announce';
import { useAutoRead } from '../a11y/modes';
import { answerParts, formatDate, keyPart } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import { rememberHostTitle, restoreHostTitle, setStepTitle } from '../a11y/title';
import { forgetEverything, loadSession, type LearnerSession } from '../api/auth';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import {
  deleteMe,
  exportMe,
  fetchMe,
  patchMe,
  type ContactMethod,
  type Me,
  type MePatch,
} from '../api/me';
import { putSupportRequest } from '../api/registrations';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { VisuallyHidden } from '../components/VisuallyHidden';
import { getFlow } from '../engine/FlowRunner';
import { resolveOptions } from '../engine/options';
import type { Step } from '../engine/types';
import { isValueEmpty, validateStep } from '../engine/validate';
import { ListenButton } from '../i18n/ReadAloud';
import { languageName } from '../i18n/registry';
import { t } from '../i18n/t';
import { gregorianToEthiopian, type DateAnswerValue } from '../lib/ethiopianCalendar';
import { formatEthiopianPhoneDisplay } from '../lib/phone';
import { loadSnapshot, saveNeeds } from '../offline/snapshot';
import { QuestionScreen } from '../screens/QuestionScreen';
import { transcribeClip } from '../voice/transcribeClip';
import type { VoiceClipOutcome } from '../voice/types';

export interface ProfilePageProps {
  api: ApiConfig; // origin + partner key, no token
  lang: string;
  /** The languages offered (for "Language"). */
  languages: string[];
  manageTitle: boolean;
  /** Opened by the person (Done screen, Save panel): focus its heading. Never on first load. */
  focusOnMount?: boolean;
  /** "Sign up" or "Continue signing up". */
  onSignUp: () => void;
  /** The language was changed here: the widget switches to it. */
  onLanguage: (lang: string) => void;
  onSimple: (simple: boolean) => void;
  /** Everything was deleted (server and this device). */
  onDeleted: () => void;
}

type Field =
  | 'full_name'
  | 'preferred_name'
  | 'contact_method'
  | 'phone'
  | 'dob'
  | 'language'
  | 'simple_mode'
  | 'support_needs'
  | 'support_other'
  | 'support_share';

type Screen =
  | { name: 'loading' }
  | { name: 'no_session'; draftOnDevice: boolean }
  | { name: 'not_registered' }
  | { name: 'error'; code: string }
  | { name: 'view' }
  | { name: 'edit'; field: Field; contact?: ContactMethod }
  | { name: 'deleted' };

const SUPPORT_FIELDS: Field[] = ['support_needs', 'support_other', 'support_share'];
const PHONE_METHODS = ['phone', 'telegram'];

const signupStep = (id: string): Step | undefined =>
  getFlow('signup')?.steps.find((s) => s.id === id);

/** A date from the server may only have `iso`: work out the Ethiopian day for the date field. */
function toDateValue(dob: Me['dob']): DateAnswerValue | null {
  if (!dob?.iso) return null;
  if (dob.ethiopian) return dob;
  const [y, m, d] = dob.iso.split('-').map(Number);
  return { ...dob, ethiopian: gregorianToEthiopian(y, m, d) };
}

function shareList(me: Me): string[] {
  const share = me.support?.share_with;
  return [share?.courses && 'courses', share?.employers && 'employers'].filter(
    (v): v is string => !!v,
  );
}

export function ProfilePage({
  api,
  lang,
  languages,
  manageTitle,
  focusOnMount = false,
  onSignUp,
  onLanguage,
  onSimple,
  onDeleted,
}: ProfilePageProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [me, setMe] = useState<Me | null>(null);
  const [session, setSession] = useState<LearnerSession | null>(null);
  const [reload, setReload] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  // Why the profile shows: first load (read it all), after a save ("Your change was saved"),
  // or back from a question without saving (focus says where they are).
  const [viewReason, setViewReason] = useState<'load' | 'saved' | 'back'>('load');
  const [lastField, setLastField] = useState<Field | null>(null);

  // The question being changed.
  const [value, setValue] = useState<unknown>(null);
  const [error, setError] = useState<string | undefined>();
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  const changeRefs = useRef<Partial<Record<Field, HTMLButtonElement | null>>>({});
  const focusNext = useRef<'heading' | 'question' | 'saved' | Field | null>(
    focusOnMount ? 'heading' : null,
  );

  const learnerApi = useMemo(
    () => (session ? { ...api, token: session.token } : null),
    [api, session],
  );

  /* ---------------------------------------------------------------- */
  /*  Loading                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let active = true;
    setScreen({ name: 'loading' });
    void (async () => {
      const noSession = async () => {
        const snap = await loadSnapshot().catch(() => null);
        if (active) setScreen({ name: 'no_session', draftOnDevice: !!snap });
      };
      const s = await loadSession().catch(() => null);
      if (!active) return;
      if (!s) return noSession();
      setSession(s);
      try {
        const data = await fetchMe({ ...api, token: s.token });
        if (!active) return;
        setMe(data);
        setViewReason('load');
        setScreen({ name: 'view' });
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && [401, 403, 404].includes(err.status)) return noSession();
        if (err instanceof ApiError && err.status === 409) {
          setScreen({ name: 'not_registered' });
          return;
        }
        setScreen({ name: 'error', code: errorCode(err) });
      }
    })();
    return () => {
      active = false;
    };
  }, [api, reload]);

  // The page title follows the screen; the host page's title comes back when we leave.
  useEffect(() => {
    rememberHostTitle(manageTitle);
    return () => restoreHostTitle();
  }, [manageTitle]);

  /* ---------------------------------------------------------------- */
  /*  Questions (the sign-up steps, plus language and Simple mode)    */
  /* ---------------------------------------------------------------- */

  const languageStep = useMemo<Step>(
    () => ({
      id: 'language',
      type: 'single_choice',
      title: 'profile.language.title',
      required: true,
      options: languages.map((l) => ({ value: l, label: languageName(l), literal: true, lang: l })),
    }),
    [languages],
  );
  const simpleStep: Step = {
    id: 'simple_mode',
    type: 'single_choice',
    title: 'profile.simple_mode.title',
    hint: 'profile.simple_mode.hint',
    required: true,
    options: [
      { value: 'yes', label: 'common.yes' },
      { value: 'no', label: 'common.no' },
    ],
  };

  const stepFor = (field: Field): Step | undefined => {
    if (field === 'language') return languageStep;
    if (field === 'simple_mode') return simpleStep;
    return signupStep(field);
  };

  const currentValue = (field: Field, data: Me): unknown => {
    switch (field) {
      case 'full_name':
        return data.full_name ?? '';
      case 'preferred_name':
        return data.preferred_name ?? '';
      case 'contact_method':
        return data.contact_method ?? '';
      case 'phone':
        return data.phone ? formatEthiopianPhoneDisplay(data.phone) : '';
      case 'dob':
        return toDateValue(data.dob);
      case 'language':
        return data.language || lang;
      case 'simple_mode':
        return data.simple_mode ? 'yes' : 'no';
      case 'support_needs':
        return data.support?.needs ?? [];
      case 'support_other':
        return data.support?.other_text ?? '';
      case 'support_share':
        return shareList(data);
    }
  };

  const openEdit = (field: Field, contact?: ContactMethod) => {
    if (!me) return;
    setValue(currentValue(field, me));
    setError(undefined);
    setLastField(field);
    focusNext.current = 'question';
    setScreen({ name: 'edit', field, contact });
  };

  const backToView = (saved: boolean) => {
    focusNext.current = saved ? 'saved' : lastField;
    if (saved) setSavedCount((n) => n + 1);
    setViewReason(saved ? 'saved' : 'back');
    setScreen({ name: 'view' });
  };

  /* ---------------------------------------------------------------- */
  /*  Saving                                                           */
  /* ---------------------------------------------------------------- */

  const fail = (err: unknown, field: Field) => {
    if (err instanceof ApiError && err.status === 409) {
      setScreen({ name: 'not_registered' });
      return;
    }
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      setScreen({ name: 'no_session', draftOnDevice: false });
      return;
    }
    const fieldError =
      err instanceof ApiError
        ? (err.errors.find((e) => e.field === field) ?? err.errors[0])
        : undefined;
    setError(fieldError?.code ?? errorCode(err));
    setErrorAttempt((n) => n + 1);
  };

  const save = async (field: Field, step: Step, contact?: ContactMethod) => {
    if (!me || !learnerApi || saving) return;
    const problem = validateStep(step, value);
    if (problem) {
      setError(problem);
      setErrorAttempt((n) => n + 1);
      return;
    }

    // A phone or Telegram contact needs a number: ask it next (with the one we have).
    if (field === 'contact_method' && PHONE_METHODS.includes(String(value))) {
      setValue(currentValue('phone', me));
      setError(undefined);
      focusNext.current = 'question';
      setScreen({ name: 'edit', field: 'phone', contact: value as ContactMethod });
      return;
    }

    setSaving(true);
    try {
      if (SUPPORT_FIELDS.includes(field)) {
        const support = {
          needs: me.support?.needs ?? [],
          other_text: me.support?.other_text ?? '',
          share_with: {
            courses: me.support?.share_with?.courses ?? false,
            employers: me.support?.share_with?.employers ?? false,
          },
        };
        if (field === 'support_needs') support.needs = (value as string[]) ?? [];
        if (field === 'support_other') support.other_text = String(value ?? '').trim();
        if (field === 'support_share') {
          const list = Array.isArray(value) ? (value as string[]) : [];
          support.share_with = {
            courses: list.includes('courses'),
            employers: list.includes('employers'),
          };
        }
        await putSupportRequest(learnerApi, me.registration_id, support);
        setMe({ ...me, support });
        // The jobs filter on this device starts from these needs.
        if (field === 'support_needs') void saveNeeds(support.needs).catch(() => {});
      } else {
        const body: MePatch = {};
        if (field === 'full_name') body.full_name = String(value ?? '').trim();
        if (field === 'preferred_name') body.preferred_name = String(value ?? '').trim();
        if (field === 'contact_method') body.contact_method = value as ContactMethod;
        if (field === 'phone') {
          body.phone = String(value ?? '').trim();
          if (contact) body.contact_method = contact;
        }
        if (field === 'dob') {
          const d = value as DateAnswerValue | null;
          body.dob =
            isValueEmpty(d) || !d
              ? null
              : { calendar: d.calendar, ethiopian: d.ethiopian, iso: d.iso };
        }
        if (field === 'language') body.language = String(value);
        if (field === 'simple_mode') body.simple_mode = value === 'yes';
        const updated = await patchMe(learnerApi, body);
        setMe(updated ?? me);
        if (field === 'language') onLanguage(String(value));
        if (field === 'simple_mode') onSimple(value === 'yes');
      }
      announce(t(field === 'language' ? String(value) : lang, 'profile.saved'));
      backToView(true);
    } catch (err) {
      fail(err, field);
    } finally {
      setSaving(false);
    }
  };

  const handleVoiceClip = async (clipId: string, step: Step): Promise<VoiceClipOutcome | null> => {
    if (!learnerApi) return { code: 'speech_unavailable' };
    const res = await transcribeClip(learnerApi, clipId, step, lang);
    if ('text' in res) {
      if (step.type !== 'single_choice') setValue(res.text);
      return res;
    }
    announce(t(lang, `errors.${res.code}`));
    return res;
  };

  /* ---------------------------------------------------------------- */
  /*  Data export (Q4)                                                 */
  /* ---------------------------------------------------------------- */

  const handleExport = async () => {
    if (!learnerApi || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const data = await exportMe(learnerApi);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bridge-data-${(data.learner?.learner_id || 'me').slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      announce(t(lang, 'profile.export_success'));
    } catch (err) {
      const code = errorCode(err);
      setExportError(code);
      announce(t(lang, `errors.${code}`));
    } finally {
      setExporting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Deleting                                                         */
  /* ---------------------------------------------------------------- */

  const handleDelete = async () => {
    if (!learnerApi || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMe(learnerApi);
    } catch (err) {
      // Already gone (or the session too): there is nothing left to delete on the server.
      if (!(err instanceof ApiError && [401, 404].includes(err.status))) {
        const code = errorCode(err);
        setDeleteError(code);
        announce(t(lang, `errors.${code}`));
        setDeleting(false);
        return;
      }
    }
    await forgetEverything().catch(() => {});
    setDeleting(false);
    setDeleteOpen(false);
    setMe(null);
    setSession(null);
    focusNext.current = 'heading';
    setScreen({ name: 'deleted' });
    announce(t(lang, 'profile.deleted_title'));
    onDeleted();
  };

  /* ---------------------------------------------------------------- */
  /*  Focus and page title                                             */
  /* ---------------------------------------------------------------- */

  const editStep = screen.name === 'edit' ? stepFor(screen.field) : undefined;

  useEffect(() => {
    if (screen.name === 'loading') return;
    const target = focusNext.current;
    focusNext.current = null;
    // After the panel that opened us has closed (it gives focus back on close).
    const timer = window.setTimeout(() => {
      if (target === 'heading') headingRef.current?.focus();
      else if (target === 'question') questionHeadingRef.current?.focus();
      else if (target === 'saved') savedRef.current?.focus();
      else if (target) changeRefs.current[target]?.focus();
    }, 0);
    const title = editStep ? t(lang, editStep.title) : t(lang, 'profile.title');
    setStepTitle(title);
    return () => window.clearTimeout(timer);
    // On each new screen only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /* ---------------------------------------------------------------- */
  /*  What is shown (and read)                                         */
  /* ---------------------------------------------------------------- */

  interface Row {
    field: Field | null; // null: can't be changed here
    label: string;
    value: string;
    valueLang?: string;
    personal: boolean;
    spoken: Part[];
  }

  const rows = (data: Me): Row[] => {
    const out: Row[] = [];
    const notGiven = [keyPart(lang, 'speech.not_answered')];
    const stepRow = (field: Field, display: string, personal: boolean) => {
      const step = stepFor(field);
      const v = currentValue(field, data);
      const spoken = step ? answerParts(step, v, lang, {}, 'speech.answer_on_screen') : [];
      out.push({
        field,
        label: t(lang, `profile.label.${field}`),
        value: display || '—',
        personal,
        spoken: spoken.length > 0 ? spoken : notGiven,
      });
    };
    const labelsOf = (field: Field, v: string[]) => {
      const step = stepFor(field);
      if (!step) return v.join(', ');
      const options = resolveOptions(step, {});
      return v
        .map((code) => {
          const o = options.find((x) => x.value === code);
          return o ? (o.literal ? o.label : t(lang, o.label)) : code;
        })
        .join(', ');
    };

    stepRow('full_name', data.full_name, true);
    stepRow('preferred_name', data.preferred_name, true);
    stepRow(
      'contact_method',
      data.contact_method ? t(lang, `signup.contact_method.${data.contact_method}`) : '',
      false,
    );
    if (PHONE_METHODS.includes(data.contact_method) || data.phone) {
      stepRow('phone', data.phone ? formatEthiopianPhoneDisplay(data.phone) : '', true);
    }
    const dob = toDateValue(data.dob);
    stepRow('dob', dob ? formatDate(dob, lang) : '', true);
    out.push({
      field: 'language',
      label: t(lang, 'profile.label.language'),
      value: languageName(data.language || lang),
      valueLang: data.language || lang,
      personal: false,
      spoken: [{ text: languageName(data.language || lang), lang: data.language || lang }],
    });
    out.push({
      field: 'simple_mode',
      label: t(lang, 'profile.label.simple_mode'),
      value: t(lang, data.simple_mode ? 'common.yes' : 'common.no'),
      personal: false,
      spoken: [keyPart(lang, data.simple_mode ? 'common.yes' : 'common.no')],
    });
    if (data.identity) {
      const doc = [
        t(lang, `signup.id_route.${data.identity.route}`),
        data.identity.doc_type && t(lang, `signup.id_doc_type.${data.identity.doc_type}`),
      ]
        .filter(Boolean)
        .join(': ');
      out.push({
        field: null,
        label: t(lang, 'profile.label.document'),
        value: doc,
        personal: false,
        spoken: [doc],
      });
      const level = t(lang, `profile.level.${data.identity.level}`);
      out.push({
        field: null,
        label: t(lang, 'profile.label.identity_level'),
        value: level,
        personal: false,
        spoken: [level],
      });
    }
    if (data.referral) {
      const how = data.referral.contact_preference
        ? t(lang, `signup.referral_contact.${data.referral.contact_preference}`)
        : '';
      const status = t(lang, `profile.referral_status.${data.referral.status}`);
      const text = [data.referral.partner_name, how, status].filter(Boolean).join('. ');
      out.push({
        field: null,
        label: t(lang, 'profile.label.referral'),
        value: text,
        personal: false,
        spoken: [text],
      });
    }
    stepRow('support_needs', labelsOf('support_needs', data.support?.needs ?? []), false);
    stepRow('support_other', data.support?.other_text ?? '', true);
    stepRow('support_share', labelsOf('support_share', shareList(data)), false);
    if (data.registered_at) {
      const when = new Date(data.registered_at).toLocaleDateString(
        lang === 'am' ? 'am-ET' : 'en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' },
      );
      out.push({
        field: null,
        label: t(lang, 'profile.label.registered'),
        value: when,
        personal: false,
        spoken: [when],
      });
    }
    return out;
  };

  const draft = me?.status === 'draft';

  const viewParts = (): Part[] => {
    if (!me) return [];
    const parts: Part[] = [keyPart(lang, 'profile.title'), keyPart(lang, 'profile.intro')];
    if (draft) parts.push(keyPart(lang, 'profile.draft_body'));
    for (const row of rows(me)) parts.push(row.label, ...row.spoken);
    parts.push(keyPart(lang, 'profile.export_title'), keyPart(lang, 'profile.export_body'));
    parts.push(keyPart(lang, 'profile.delete_title'), keyPart(lang, 'profile.delete_body'));
    return parts;
  };

  const messageParts = (): Part[] => {
    switch (screen.name) {
      case 'no_session':
        return screen.draftOnDevice
          ? [keyPart(lang, 'profile.draft_title'), keyPart(lang, 'profile.draft_body')]
          : [keyPart(lang, 'profile.none_title'), keyPart(lang, 'profile.none_body')];
      case 'not_registered':
        return [keyPart(lang, 'profile.draft_title'), keyPart(lang, 'profile.draft_body')];
      case 'error':
        return [keyPart(lang, 'profile.error_title'), t(lang, `errors.${screen.code}`)];
      case 'deleted':
        return [keyPart(lang, 'profile.deleted_title'), keyPart(lang, 'profile.deleted_body')];
      default:
        return [];
    }
  };

  // Read aloud mode: the profile when it shows; after a change, only "Your change was saved".
  const readKey =
    screen.name === 'view'
      ? viewReason === 'load'
        ? 'profile-view'
        : viewReason === 'saved'
          ? `profile-saved:${savedCount}`
          : null
      : ['no_session', 'not_registered', 'error', 'deleted'].includes(screen.name)
        ? `profile-${screen.name}`
        : null;
  useAutoRead(
    readKey,
    () =>
      screen.name === 'view'
        ? viewReason === 'saved'
          ? [keyPart(lang, 'profile.saved')]
          : viewParts()
        : messageParts(),
    lang,
  );

  /* ---------------------------------------------------------------- */
  /*  Screens                                                          */
  /* ---------------------------------------------------------------- */

  const message = (titleKey: string, body: ReactNode, actions: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <h1 tabIndex={-1} ref={headingRef}>
        {t(lang, titleKey)}
      </h1>
      {body}
      <div className="bo-actions">
        {actions}
        <ListenButton lang={lang} parts={messageParts} />
      </div>
    </div>
  );

  if (screen.name === 'loading') return <p>{t(lang, 'common.loading')}</p>;

  if (screen.name === 'no_session' || screen.name === 'not_registered') {
    const draftLike = screen.name === 'not_registered' || screen.draftOnDevice;
    return message(
      draftLike ? 'profile.draft_title' : 'profile.none_title',
      <p style={{ margin: 0 }}>
        {t(lang, draftLike ? 'profile.draft_body' : 'profile.none_body')}
      </p>,
      <Button variant="primary" onClick={onSignUp}>
        {t(lang, draftLike ? 'profile.continue_signup' : 'apply.signup_first_action')}
      </Button>,
    );
  }

  if (screen.name === 'error') {
    return message(
      'profile.error_title',
      <Banner variant="error" quiet>
        {t(lang, `errors.${screen.code}`)}
      </Banner>,
      <Button variant="primary" onClick={() => setReload((n) => n + 1)}>
        {t(lang, 'common.try_again')}
      </Button>,
    );
  }

  if (screen.name === 'deleted') {
    return message(
      'profile.deleted_title',
      <p style={{ margin: 0 }}>{t(lang, 'profile.deleted_body')}</p>,
      null,
    );
  }

  if (screen.name === 'edit' && editStep) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
        <div>
          <button type="button" className="bo-link" onClick={() => backToView(false)}>
            <span aria-hidden="true">← </span>
            {t(lang, 'profile.back')}
          </button>
        </div>
        <QuestionScreen
          key={`${screen.field}:${screen.contact ?? ''}`}
          step={editStep}
          lang={lang}
          value={value}
          error={error}
          errorFocusKey={errorAttempt}
          headingRef={questionHeadingRef}
          onChange={(v) => {
            setValue(v);
            setError(undefined);
          }}
          onContinue={() => void save(screen.field, editStep, screen.contact)}
          voice={{ onPending: (clipId) => handleVoiceClip(clipId, editStep) }}
          submitLabel={t(lang, saving ? 'common.sending' : 'profile.save')}
        />
      </div>
    );
  }

  if (!me) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
      <h1 tabIndex={-1} ref={headingRef}>
        {t(lang, 'profile.title')}
      </h1>
      <p className="bo-hint">{t(lang, 'profile.intro')}</p>

      {viewReason === 'saved' && (
        <div ref={savedRef} tabIndex={-1}>
          <Banner variant="success" quiet>
            {t(lang, 'profile.saved')}
          </Banner>
        </div>
      )}

      <div>
        <ListenButton lang={lang} parts={viewParts} />
      </div>

      {draft && (
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
          <p style={{ margin: 0, fontWeight: 600 }}>{t(lang, 'profile.draft_body')}</p>
          <div>
            <Button variant="primary" onClick={onSignUp}>
              {t(lang, 'profile.continue_signup')}
            </Button>
          </div>
        </div>
      )}

      <dl
        style={{
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '1px solid var(--bo-border-subtle)',
        }}
      >
        {rows(me).map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 'var(--bo-space-2)',
              padding: 'var(--bo-space-3) 0',
              borderBottom: '1px solid var(--bo-border-subtle)',
            }}
          >
            <dt style={{ fontWeight: 700, flexBasis: '40%', minWidth: 0 }}>{row.label}</dt>
            <dd
              lang={row.valueLang}
              data-bo-private={row.personal ? '' : undefined}
              style={{ margin: 0, flexGrow: 1, minWidth: 0, color: 'var(--bo-text-muted)' }}
            >
              {row.value}
            </dd>
            {row.field && !draft && (
              <dd style={{ margin: 0 }}>
                <button
                  type="button"
                  className="bo-link"
                  ref={(el) => {
                    if (row.field) changeRefs.current[row.field] = el;
                  }}
                  onClick={() => row.field && openEdit(row.field)}
                  style={{ fontWeight: 700 }}
                >
                  {t(lang, 'common.change')}
                  <VisuallyHidden> {row.label}</VisuallyHidden>
                </button>
              </dd>
            )}
          </div>
        ))}
      </dl>

      <section
        aria-labelledby="bo-export-title"
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
        <h2 id="bo-export-title" style={{ fontSize: '1.1em', margin: 0 }}>
          {t(lang, 'profile.export_title')}
        </h2>
        <p style={{ margin: 0 }}>{t(lang, 'profile.export_body')}</p>
        <div>
          <Button
            variant="secondary"
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-busy={exporting || undefined}
          >
            {t(lang, exporting ? 'profile.exporting' : 'profile.export_button')}
          </Button>
        </div>
        {exportError && (
          <Banner variant="error" quiet>
            {t(lang, `errors.${exportError}`)}
          </Banner>
        )}
      </section>

      <section
        aria-labelledby="bo-delete-title"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--bo-space-3)',
          padding: 'var(--bo-space-4)',
          border: '2px solid var(--bo-error)',
          borderRadius: 'var(--bo-radius)',
        }}
      >
        <h2 id="bo-delete-title" style={{ fontSize: '1.1em' }}>
          {t(lang, 'profile.delete_title')}
        </h2>
        <p style={{ margin: 0 }}>{t(lang, 'profile.delete_body')}</p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
            style={{ color: 'var(--bo-error)', borderColor: 'var(--bo-error)' }}
          >
            {t(lang, 'profile.delete_title')}
          </Button>
        </div>
      </section>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        title={t(lang, 'profile.delete_confirm_title')}
        lang={lang}
        readParts={() => [
          keyPart(lang, 'profile.delete_confirm_title'),
          keyPart(lang, 'profile.delete_confirm_body'),
          deleteError && t(lang, `errors.${deleteError}`),
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}>
          <p style={{ margin: 0 }}>{t(lang, 'profile.delete_confirm_body')}</p>
          {deleteError && (
            <Banner variant="error" quiet>
              {t(lang, `errors.${deleteError}`)}
            </Banner>
          )}
          <div className="bo-actions">
            {/* Not disabled while deleting (focus would be lost): a second press does nothing. */}
            <Button
              variant="primary"
              onClick={() => void handleDelete()}
              aria-busy={deleting || undefined}
              style={{ background: 'var(--bo-error)', borderColor: 'var(--bo-error)' }}
            >
              {t(lang, deleting ? 'profile.deleting' : 'profile.delete_yes')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (!deleting) setDeleteOpen(false);
              }}
            >
              {t(lang, 'common.cancel')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
