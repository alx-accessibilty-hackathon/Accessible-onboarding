import { useEffect, useRef, useState } from 'react';
import { useFocusSpeech } from '../a11y/focusSpeech';
import { LiveRegion } from '../a11y/LiveRegion';
import { ModesProvider, useModes } from '../a11y/modes';
import { scaleClass, scaleStyle, useTextSize } from '../a11y/settings';
import { logout, staffMe, type StaffUser } from '../api/auth';
import { ApiError } from '../api/client';
import { ModeToggles } from '../shell/ModeToggles';
import { ReadAloudNotice } from '../shell/ReadAloudNotice';
import { EmployerJobs } from './EmployerJobs';
import { Login } from './Login';
import { PartnerReferrals } from './PartnerReferrals';

const TOKEN_KEY = 'bo:staff_token';
const USER_KEY = 'bo:staff_user';

// Same-site by default (the dev server sends /api to the Go API).
const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? '';

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The staff pages: the same Read aloud (on by default), focus reading and text size as the
 * widget. English only. */
export function StaffApp() {
  return (
    <ModesProvider>
      <StaffShell />
    </ModesProvider>
  );
}

function StaffShell() {
  const [token, setToken] = useState<string | null>(() => readStorage(TOKEN_KEY));
  const [user, setUser] = useState<StaffUser | null>(() => {
    const raw = readStorage(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StaffUser;
    } catch {
      return null;
    }
  });
  const rootRef = useRef<HTMLElement>(null);
  const { readAloud } = useModes();
  const textSize = useTextSize();
  const lang = 'en';

  // Read aloud mode: say the element the person moves to, and what they select.
  useFocusSpeech(rootRef, lang, readAloud);

  const clearLocal = () => {
    setToken(null);
    setUser(null);
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      // storage blocked
    }
  };

  // A token kept from earlier may have expired: check it once.
  useEffect(() => {
    if (!token) return;
    staffMe(API_ORIGIN, token)
      .then((me) => {
        setUser(me);
        try {
          sessionStorage.setItem(USER_KEY, JSON.stringify(me));
        } catch {
          // storage blocked
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) clearLocal();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoginSuccess = (newToken: string, loggedInUser: StaffUser) => {
    setToken(newToken);
    setUser(loggedInUser);
    try {
      sessionStorage.setItem(TOKEN_KEY, newToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(loggedInUser));
    } catch {
      // storage blocked: signed in for this page only
    }
  };

  const handleLogout = () => {
    if (token) void logout({ origin: API_ORIGIN, partnerKey: '', token }).catch(() => {});
    clearLocal();
  };

  return (
    <main
      ref={rootRef}
      className={`bo-root${scaleClass(textSize)}`}
      lang={lang}
      style={{
        minHeight: '100vh',
        padding: 'var(--bo-space-5) var(--bo-space-4)',
        ...scaleStyle(textSize),
      }}
    >
      <div className="bo-frame" style={{ maxWidth: '48em', padding: 0 }}>
        <ReadAloudNotice lang={lang} languages={[lang]} />
        <div
          className="bo-header"
          style={{
            borderBottom: '1px solid var(--bo-border-subtle)',
            paddingBottom: 'var(--bo-space-3)',
          }}
        >
          <ModeToggles lang={lang} answerBySpeaking={false} />
        </div>
        {!token || !user ? (
          <Login onSuccess={handleLoginSuccess} lang={lang} apiOrigin={API_ORIGIN} />
        ) : user.role === 'partner_staff' ? (
          <PartnerReferrals
            user={user}
            token={token}
            lang={lang}
            apiOrigin={API_ORIGIN}
            onLogout={handleLogout}
          />
        ) : (
          <EmployerJobs
            user={user}
            token={token}
            lang={lang}
            apiOrigin={API_ORIGIN}
            onLogout={handleLogout}
          />
        )}
      </div>
      <LiveRegion />
    </main>
  );
}
