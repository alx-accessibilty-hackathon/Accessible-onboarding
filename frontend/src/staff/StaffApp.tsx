import { useEffect, useState } from 'react';
import { LiveRegion } from '../a11y/LiveRegion';
import { logout, staffMe, type StaffUser } from '../api/auth';
import { ApiError } from '../api/client';
import { EmployerJobs } from './EmployerJobs';
import { Login } from './Login';

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

export function StaffApp() {
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

  const lang = 'en';

  return (
    <main
      className="bo-root"
      lang={lang}
      style={{ minHeight: '100vh', padding: 'var(--bo-space-5) var(--bo-space-4)' }}
    >
      <div className="bo-frame" style={{ maxWidth: '48em' }}>
        {!token || !user ? (
          <Login onSuccess={handleLoginSuccess} lang={lang} apiOrigin={API_ORIGIN} />
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
