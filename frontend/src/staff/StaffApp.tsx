import { useState } from 'react';
import type { StaffUser } from '../api/auth';
import { EmployerJobs } from './EmployerJobs';
import { Login } from './Login';

const TOKEN_KEY = 'bo:staff_token';
const USER_KEY = 'bo:staff_user';

export function StaffApp() {
  const [token, setToken] = useState<string | null>(() => {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  });

  const [user, setUser] = useState<StaffUser | null>(() => {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StaffUser;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (newToken: string, loggedInUser: StaffUser) => {
    setToken(newToken);
    setUser(loggedInUser);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TOKEN_KEY, newToken);
      sessionStorage.setItem(USER_KEY, JSON.stringify(loggedInUser));
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  };

  const lang = 'en';

  return (
    <main className="bo-root" lang={lang} style={{ minHeight: '100vh', padding: 'var(--bo-space-5)' }}>
      <div className="bo-frame" style={{ maxWidth: '48em' }}>
        {!token || !user ? (
          <Login onSuccess={handleLoginSuccess} lang={lang} />
        ) : (
          <EmployerJobs
            user={user}
            token={token}
            lang={lang}
            onLogout={handleLogout}
          />
        )}
      </div>
    </main>
  );
}
