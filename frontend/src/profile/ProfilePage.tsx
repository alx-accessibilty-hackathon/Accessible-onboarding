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
import { listMyApplications, setSupportSharing, type MyApplication } from '../api/applications';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import {
  confirmPhoneCode,
  confirmVouch,
  deleteMe,
  exportMe,
  fetchMe,
  patchMe,
  sendPhoneCode,
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
  /** Real SMS is on (GET /config sms.verify_phone): offer the optional phone check. */
  canVerifyPhone?: boolean;
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
  canVerifyPhone = false,
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

  // Support passport: my applications and which employers may see my support needs.
  const [apps, setApps] = useState<MyApplication[] | null>(null);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [passportNote, setPassportNote] = useState<string | null>(null);

  // Trusted referral: the code an organisation (such as AAAPD) gave the learner.
  const [vouchCode, setVouchCode] = useState('');
  const [vouchError, setVouchError] = useState<string | null>(null);
  const [vouching, setVouching] = useState(false);
  const [vouchDone, setVouchDone] = useState<string | null>(null);

  // The optional phone check: a code by SMS to the stored number.
  const [phoneSentTo, setPhoneSentTo] = useState<string | null>(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneDone, setPhoneDone] = useState<string | null>(null);
  const phoneCodeRef = useRef<HTMLInputElement>(null);

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
        if (data.status !== 'draft') {
          // The support passport; the rest of the profile shows even if this fails.
          try {
            const list = await listMyApplications({ ...api, token: s.token });
            if (!active) return;
            setApps(list);
            setAppsError(null);
          } catch (err) {
            if (!active) return;
            setApps(null);
            setAppsError(errorCode(err));
          }
        }
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
    const res = await transcribeClip(learnerApi, clipId, step, lang, me?.registration_id);
    if ('text' in res) {
      if (step.type !== 'single_choice') setValue(res.text);
      return res;
    }
    announce(t(lang, `errors.${res.code}`));
    return res;
  };

  /* ---------------------------------------------------------------- */
  /*  Support passport: share with an employer, or stop, in one tap   */
  /* ---------------------------------------------------------------- */

  const employerOf = (a: MyApplication) =>
    a.employer_name || t(lang, 'profile.passport_this_employer');

  const toggleSharing = async (app: MyApplication) => {
    // Not disabled while saving (focus would be lost): a second press does nothing.
    if (!learnerApi || sharingId) return;
    setSharingId(app.id);
    setAppsError(null);
    setPassportNote(null);
    try {
      const updated = await setSupportSharing(learnerApi, app.id, !app.share_support);
      setApps((list) => list?.map((a) => (a.id === updated.id ? updated : a)) ?? null);
      const note = t(
        lang,
        updated.share_support ? 'profile.passport_now_shared' : 'profile.passport_now_stopped',
        { employer: employerOf(updated) },
      );
      setPassportNote(note);
      announce(note);
    } catch (err) {
      const code = errorCode(err);
      setAppsError(code);
      announce(t(lang, `errors.${code}`));
    } finally {
      setSharingId(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Trusted referral: enter the code the organisation gave me        */
  /* ---------------------------------------------------------------- */

  const canVouch = (data: Me) =>
    !!data.referral &&
    data.status !== 'draft' &&
    data.identity?.level !== 'partner_attested' &&
    data.identity?.level !== 'verified';

  const partnerOf = (data: Me) =>
    data.referral?.partner_name || t(lang, 'profile.passport_this_employer');

  const submitVouch = async () => {
    if (!me || !learnerApi || vouching) return;
    const partner = partnerOf(me);
    const fail = (msg: string) => {
      setVouchError(msg);
      announce(msg);
    };
    if (!vouchCode.trim()) {
      fail(t(lang, 'profile.vouch_required'));
      return;
    }
    setVouching(true);
    setVouchError(null);
    try {
      const res = await confirmVouch(learnerApi, vouchCode);
      const name = res.partner_name || partner;
      setMe({
        ...me,
        identity: me.identity ? { ...me.identity, level: res.identity_level } : me.identity,
        referral: me.referral ? { ...me.referral, status: 'attested' } : me.referral,
      });
      setVouchCode('');
      const msg = t(lang, 'profile.vouch_done', { partner: name });
      setVouchDone(msg);
      announce(msg);
    } catch (err) {
      const fieldCode =
        err instanceof ApiError ? err.errors.find((e) => e.field === 'code')?.code : '';
      if (fieldCode === 'code_expired') fail(t(lang, 'profile.vouch_expired', { partner }));
      else if (fieldCode === 'code_wrong') fail(t(lang, 'profile.vouch_wrong', { partner }));
      else if (fieldCode === 'required') fail(t(lang, 'profile.vouch_required'));
      else fail(t(lang, `errors.${errorCode(err)}`));
    } finally {
      setVouching(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Optional phone check: a 6-digit code by SMS                      */
  /* ---------------------------------------------------------------- */

  const canCheckPhone = (data: Me) =>
    canVerifyPhone && data.status !== 'draft' && !!data.phone && !data.phone_verified;

  const phoneFail = (msg: string) => {
    setPhoneError(msg);
    announce(msg);
  };

  const phoneErrorText = (err: unknown): string => {
    const field = err instanceof ApiError ? err.errors[0]?.code : '';
    const code = errorCode(err);
    if (field === 'sms_not_supported') return t(lang, 'profile.verify_phone_not_supported');
    if (field === 'code_wrong') return t(lang, 'profile.verify_phone_wrong');
    if (field === 'required') return t(lang, 'profile.verify_phone_required');
    if (code === 'rate_limited') return t(lang, 'profile.verify_phone_wait');
    return t(lang, `errors.${code}`);
  };

  const requestPhoneCode = async () => {
    if (!learnerApi || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const sent = await sendPhoneCode(learnerApi);
      setPhoneSentTo(sent.sent_to);
      setPhoneCode('');
      announce(t(lang, 'profile.verify_phone_sent', { phone: sent.sent_to }));
      window.setTimeout(() => phoneCodeRef.current?.focus(), 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && me) {
        setMe({ ...me, phone_verified: true }); // already confirmed
      } else {
        phoneFail(phoneErrorText(err));
      }
    } finally {
      setPhoneBusy(false);
    }
  };

  const submitPhoneCode = async () => {
    if (!learnerApi || phoneBusy) return;
    if (!phoneCode.trim()) {
      phoneFail(t(lang, 'profile.verify_phone_required'));
      return;
    }
    setPhoneBusy(true);
    setPhoneError(null);
    try {
      const updated = await confirmPhoneCode(learnerApi, phoneCode);
      setMe(updated);
      setPhoneSentTo(null);
      setPhoneCode('');
      const msg = t(lang, 'profile.verify_phone_done');
      setPhoneDone(msg);
      announce(msg);
    } catch (err) {
      phoneFail(phoneErrorText(err));
    } finally {
      setPhoneBusy(false);
    }
  };

  const phoneCheckParts = (data: Me): Part[] =>
    canCheckPhone(data)
      ? [keyPart(lang, 'profile.verify_phone_title'), keyPart(lang, 'profile.verify_phone_body')]
      : [];

  const vouchParts = (data: Me): Part[] =>
    canVouch(data)
      ? [
          keyPart(lang, 'profile.vouch_title'),
          t(lang, 'profile.vouch_body', { partner: partnerOf(data) }),
        ]
      : [];

  const hasNeeds = (data: Me) =>
    (data.support?.needs?.length ?? 0) > 0 || !!data.support?.other_text?.trim();

  const passportParts = (data: Me): Part[] => {
    const parts: Part[] = [keyPart(lang, 'profile.passport_title')];
    if (!hasNeeds(data)) {
      parts.push(keyPart(lang, 'profile.passport_no_needs'));
      return parts;
    }
    parts.push(keyPart(lang, 'profile.passport_intro'));
    if (apps && apps.length === 0) parts.push(keyPart(lang, 'profile.passport_none'));
    for (const a of apps ?? []) {
      parts.push(
        a.job_title,
        employerOf(a),
        keyPart(lang, a.share_support ? 'profile.passport_shared' : 'profile.passport_not_shared'),
      );
    }
    return parts;
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
    // Only while the sign-up flow asks for it (it no longer does: one full name, Ethiopian style).
    if (stepFor('preferred_name')) stepRow('preferred_name', data.preferred_name, true);
    stepRow(
      'contact_method',
      data.contact_method ? t(lang, `signup.contact_method.${data.contact_method}`) : '',
      false,
    );
    if (PHONE_METHODS.includes(data.contact_method) || data.phone) {
      stepRow('phone', data.phone ? formatEthiopianPhoneDisplay(data.phone) : '', true);
    }
    if (data.phone) {
      const confirmed = t(
        lang,
        data.phone_verified ? 'profile.phone_verified.yes' : 'profile.phone_verified.no',
      );
      out.push({
        field: null,
        label: t(lang, 'profile.label.phone_verified'),
        value: confirmed,
        personal: false,
        spoken: [confirmed],
      });
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
    parts.push(...phoneCheckParts(me));
    parts.push(...vouchParts(me));
    if (!draft) parts.push(...passportParts(me));
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

      {phoneDone && (
        <Banner variant="success" quiet>
          {phoneDone}
        </Banner>
      )}

      {canCheckPhone(me) && (
        <section
          aria-labelledby="bo-phone-check-title"
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
          <h2 id="bo-phone-check-title" style={{ fontSize: '1.1em', margin: 0 }}>
            {t(lang, 'profile.verify_phone_title')}
          </h2>
          <p id="bo-phone-check-body" style={{ margin: 0 }}>
            {t(lang, 'profile.verify_phone_body')}
          </p>
          {phoneError && !phoneSentTo && (
            <p style={{ margin: 0, color: 'var(--bo-error)', fontWeight: 600 }}>
              <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
              {phoneError}
            </p>
          )}
          {!phoneSentTo ? (
            <div>
              <Button
                variant="primary"
                onClick={() => void requestPhoneCode()}
                aria-busy={phoneBusy || undefined}
              >
                {t(lang, 'profile.verify_phone_send')}
              </Button>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitPhoneCode();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}
            >
              <p id="bo-phone-check-sent" style={{ margin: 0, fontWeight: 600 }}>
                {t(lang, 'profile.verify_phone_sent', { phone: phoneSentTo })}
              </p>
              <label htmlFor="bo-phone-check-code" style={{ fontWeight: 700 }}>
                {t(lang, 'profile.verify_phone_label')}
              </label>
              {phoneError && (
                <p
                  id="bo-phone-check-error"
                  style={{ margin: 0, color: 'var(--bo-error)', fontWeight: 600 }}
                >
                  <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
                  {phoneError}
                </p>
              )}
              <input
                id="bo-phone-check-code"
                ref={phoneCodeRef}
                className="bo-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={phoneCode}
                aria-invalid={!!phoneError}
                aria-describedby={
                  phoneError ? 'bo-phone-check-sent bo-phone-check-error' : 'bo-phone-check-sent'
                }
                onChange={(e) => {
                  setPhoneCode(e.target.value);
                  setPhoneError(null);
                }}
                style={{ maxWidth: '12em', fontSize: '1.4em', letterSpacing: '0.15em' }}
              />
              <div className="bo-actions">
                <Button variant="primary" type="submit" aria-busy={phoneBusy || undefined}>
                  {t(lang, 'profile.verify_phone_confirm')}
                </Button>
                <Button variant="secondary" onClick={() => void requestPhoneCode()}>
                  {t(lang, 'profile.verify_phone_resend')}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {vouchDone && (
        <Banner variant="success" quiet>
          {vouchDone}
        </Banner>
      )}

      {canVouch(me) && (
        <section
          aria-labelledby="bo-vouch-title"
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
          <h2 id="bo-vouch-title" style={{ fontSize: '1.1em', margin: 0 }}>
            {t(lang, 'profile.vouch_title')}
          </h2>
          <p id="bo-vouch-body" style={{ margin: 0 }}>
            {t(lang, 'profile.vouch_body', { partner: partnerOf(me) })}
          </p>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitVouch();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}
          >
            <label htmlFor="bo-vouch-code" style={{ fontWeight: 700 }}>
              {t(lang, 'profile.vouch_label', { partner: partnerOf(me) })}
            </label>
            {vouchError && (
              <p
                id="bo-vouch-error"
                style={{ margin: 0, color: 'var(--bo-error)', fontWeight: 600 }}
              >
                <span className="bo-visually-hidden">{t(lang, 'common.error_prefix')} </span>
                {vouchError}
              </p>
            )}
            <input
              id="bo-vouch-code"
              className="bo-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={vouchCode}
              aria-invalid={!!vouchError}
              aria-describedby={vouchError ? 'bo-vouch-body bo-vouch-error' : 'bo-vouch-body'}
              onChange={(e) => {
                setVouchCode(e.target.value);
                setVouchError(null);
              }}
              style={{ maxWidth: '12em', fontSize: '1.4em', letterSpacing: '0.15em' }}
            />
            <div>
              <Button variant="primary" type="submit" aria-busy={vouching || undefined}>
                {t(lang, 'profile.vouch_button')}
              </Button>
            </div>
          </form>
        </section>
      )}

      {!draft && (
        <section
          aria-labelledby="bo-passport-title"
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
          <h2 id="bo-passport-title" style={{ fontSize: '1.1em', margin: 0 }}>
            {t(lang, 'profile.passport_title')}
          </h2>
          {!hasNeeds(me) ? (
            <>
              <p style={{ margin: 0 }}>{t(lang, 'profile.passport_no_needs')}</p>
              <div>
                <Button variant="secondary" onClick={() => openEdit('support_needs')}>
                  {t(lang, 'profile.passport_add_needs')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>{t(lang, 'profile.passport_intro')}</p>
              {passportNote && (
                <Banner variant="success" quiet>
                  {passportNote}
                </Banner>
              )}
              {apps && apps.length === 0 && (
                <p className="bo-hint" style={{ margin: 0 }}>
                  {t(lang, 'profile.passport_none')}
                </p>
              )}
              {apps && apps.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--bo-space-3)',
                  }}
                >
                  {apps.map((a) => (
                    <li
                      key={a.id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--bo-space-3)',
                        padding: 'var(--bo-space-3)',
                        border: a.share_support
                          ? '3px solid var(--bo-primary)'
                          : '2px solid var(--bo-border-subtle)',
                        borderRadius: 'var(--bo-radius)',
                        background: a.share_support ? 'var(--bo-selected-bg)' : 'var(--bo-bg)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{a.job_title}</p>
                        <p style={{ margin: 0 }}>{employerOf(a)}</p>
                        <p style={{ margin: 0, fontWeight: 600 }}>
                          <span aria-hidden="true">{a.share_support ? '✓ ' : '✕ '}</span>
                          {t(
                            lang,
                            a.share_support
                              ? 'profile.passport_shared'
                              : 'profile.passport_not_shared',
                          )}
                        </p>
                      </div>
                      <Button
                        variant={a.share_support ? 'secondary' : 'primary'}
                        onClick={() => void toggleSharing(a)}
                        aria-busy={sharingId === a.id || undefined}
                      >
                        {t(
                          lang,
                          a.share_support ? 'profile.passport_stop' : 'profile.passport_share',
                          { employer: employerOf(a) },
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {appsError && (
            <Banner variant="error" quiet>
              {t(lang, `errors.${appsError}`)}
            </Banner>
          )}
        </section>
      )}

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
