import { useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../a11y/announce';
import { useAutoRead } from '../a11y/modes';
import { spellDigits } from '../a11y/readParts';
import type { Part } from '../a11y/speaker';
import type { StaffUser } from '../api/auth';
import { ApiError, errorCode, type ApiConfig } from '../api/client';
import { fetchReferrals, updateReferral, type Referral } from '../api/partner';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { VisuallyHidden } from '../components/VisuallyHidden';
import { ListenButton } from '../i18n/ReadAloud';
import { languageName } from '../i18n/registry';
import { t } from '../i18n/t';
import { formatEthiopianPhoneDisplay } from '../lib/phone';
import { PhoneLink } from '../shell/HelpPanel';

export interface PartnerReferralsProps {
  user: StaffUser;
  token: string;
  apiOrigin?: string;
  lang?: string;
  onLogout: () => void;
}

export function referralName(r: Referral): string {
  const { preferred_name: preferred, full_name: full } = r.learner;
  if (preferred && full && preferred !== full) return `${preferred} (${full})`;
  return preferred || full || '—';
}

function formatDay(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'am' ? 'am-ET' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ST-3 (partner staff): "People who asked for help". Everyone who chose this organisation in
// "Which organisation can help you?" when signing up, newest first. Staff contact them the way
// they asked and mark it: "I'm contacting them", then "Done".
export function PartnerReferrals({
  user,
  token,
  apiOrigin = '',
  lang = 'en',
  onLogout,
}: PartnerReferralsProps) {
  const api = useMemo<ApiConfig>(
    () => ({ origin: apiOrigin, partnerKey: '', token }),
    [apiOrigin, token],
  );
  const [items, setItems] = useState<Referral[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; code: string } | null>(null);
  const statusRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    let active = true;
    setLoadError(null);
    fetchReferrals(api)
      .then((list) => {
        if (active) setItems(list);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onLogout();
        else setLoadError(errorCode(err));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, reload]);

  const statusText = (r: Referral) => t(lang, `staff.referral_status.${r.status}`);

  const itemParts = (r: Referral): Part[] => [
    referralName(r),
    t(lang, 'staff.contact_how'),
    t(lang, `signup.referral_contact.${r.contact_preference}`),
    // A learner's phone number and name are personal: device voice only.
    r.learner.phone && t(lang, 'staff.phone'),
    r.learner.phone && {
      text: spellDigits(formatEthiopianPhoneDisplay(r.learner.phone)),
      personal: true,
    },
    t(lang, 'staff.language'),
    { text: languageName(r.learner.language), lang: r.learner.language },
    t(lang, 'staff.asked_on'),
    formatDay(r.created_at, lang),
    t(lang, 'staff.status'),
    statusText(r),
  ];
  const countText = items ? t(lang, 'staff.referrals_count', { count: items.length }) : '';
  const listParts = (): Part[] => [
    t(lang, 'staff.referrals_title'),
    items && items.length === 0 ? t(lang, 'staff.no_referrals') : countText,
  ];
  const allParts = (): Part[] => [...listParts(), ...(items ?? []).flatMap((r) => itemParts(r))];
  useAutoRead(
    items ? 'staff-referrals' : loadError ? 'staff-referrals-error' : null,
    () => (loadError ? [t(lang, `errors.${loadError}`)] : listParts()),
    lang,
  );

  const setStatus = async (r: Referral, status: 'in_progress' | 'closed') => {
    if (busyId) return;
    setBusyId(r.id);
    setRowError(null);
    try {
      const updated = await updateReferral(api, r.id, status);
      const next = { ...r, ...updated, learner: updated?.learner ?? r.learner };
      setItems((list) => (list ?? []).map((x) => (x.id === r.id ? next : x)));
      announce(
        t(lang, 'staff.status_changed', { name: referralName(next), status: statusText(next) }),
      );
      // The button pressed may be gone now: keep the place on this person's status.
      window.setTimeout(() => statusRefs.current[r.id]?.focus(), 0);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      const code = errorCode(err);
      setRowError({ id: r.id, code });
      announce(t(lang, `errors.${code}`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-4)' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--bo-space-3)',
          borderBottom: '1px solid var(--bo-border-subtle)',
          paddingBottom: 'var(--bo-space-4)',
        }}
      >
        <p className="bo-hint" style={{ margin: 0 }}>
          {t(lang, 'staff.signed_in_as', { name: user.display_name || user.email })}
        </p>
        <Button variant="secondary" onClick={onLogout}>
          {t(lang, 'staff.signout_button')}
        </Button>
      </div>

      <h1 tabIndex={-1} style={{ margin: 0, fontSize: '1.5em' }}>
        {t(lang, 'staff.referrals_title')}
      </h1>
      <p className="bo-hint">{t(lang, 'staff.referrals_intro')}</p>

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
              {items.length === 0 ? t(lang, 'staff.no_referrals') : countText}
            </p>
            {items.length > 0 && (
              <ListenButton
                lang={lang}
                parts={allParts}
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
            {items.map((r) => {
              const name = referralName(r);
              return (
                <li key={r.id}>
                  <Card
                    data-bo-context={`${name}. ${statusText(r)}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bo-space-3)' }}
                  >
                    <h2 data-bo-private="" style={{ margin: 0, fontSize: '1.2em' }}>
                      {name}
                    </h2>
                    <dl style={{ margin: 0, display: 'grid', gap: 'var(--bo-space-2)' }}>
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.contact_how')}</dt>
                        <dd style={{ margin: 0 }}>
                          {t(lang, `signup.referral_contact.${r.contact_preference}`)}
                        </dd>
                      </div>
                      {r.learner.phone && (
                        <div>
                          <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.phone')}</dt>
                          <dd data-bo-private="" style={{ margin: 0 }}>
                            <PhoneLink
                              phone={formatEthiopianPhoneDisplay(r.learner.phone)}
                              lang={lang}
                            />
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.language')}</dt>
                        <dd style={{ margin: 0 }} lang={r.learner.language || undefined}>
                          {languageName(r.learner.language)}
                        </dd>
                      </div>
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.asked_on')}</dt>
                        <dd style={{ margin: 0 }}>{formatDay(r.created_at, lang)}</dd>
                      </div>
                      <div>
                        <dt style={{ fontWeight: 700 }}>{t(lang, 'staff.status')}</dt>
                        <dd
                          tabIndex={-1}
                          ref={(el) => {
                            statusRefs.current[r.id] = el;
                          }}
                          style={{ margin: 0, fontWeight: 600 }}
                        >
                          {statusText(r)}
                        </dd>
                      </div>
                    </dl>

                    {rowError?.id === r.id && (
                      <Banner variant="error" quiet>
                        {t(lang, `errors.${rowError.code}`)}
                      </Banner>
                    )}

                    {r.status !== 'closed' && (
                      <div className="bo-actions">
                        {r.status === 'requested' && (
                          <Button
                            variant="primary"
                            aria-busy={busyId === r.id || undefined}
                            onClick={() => void setStatus(r, 'in_progress')}
                          >
                            {t(lang, 'staff.mark_in_progress')}
                            <VisuallyHidden>: {name}</VisuallyHidden>
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          aria-busy={busyId === r.id || undefined}
                          onClick={() => void setStatus(r, 'closed')}
                        >
                          {t(lang, 'staff.mark_closed')}
                          <VisuallyHidden>: {name}</VisuallyHidden>
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
