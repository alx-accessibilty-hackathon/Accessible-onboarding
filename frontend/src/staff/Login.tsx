import { useState, type FormEvent } from 'react';
import { staffLogin, staffMe, type StaffUser } from '../api/auth';
import { ApiError, errorCode } from '../api/client';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { t } from '../i18n/t';

export interface LoginProps {
  apiOrigin?: string;
  lang?: string;
  onSuccess: (token: string, user: StaffUser) => void;
}

// ST-1: email and password (paste allowed). Errors come from the API, nothing is invented.
export function Login({ apiOrigin = '', lang = 'en', onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t(lang, 'staff.missing_fields'));
      return;
    }
    setLoading(true);

    try {
      const { token } = await staffLogin(apiOrigin, email.trim(), password);
      const user = await staffMe(apiOrigin, token);
      onSuccess(token, user);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t(lang, 'staff.login_failed'));
      } else if (err instanceof ApiError && err.status === 422) {
        setError(t(lang, 'staff.missing_fields'));
      } else {
        setError(t(lang, `errors.${errorCode(err)}`));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      className="bo-staff-login-card"
      style={{ maxWidth: '28em', margin: 'var(--bo-space-5) auto' }}
    >
      <h1 style={{ marginBottom: 'var(--bo-space-4)', fontSize: '1.4em' }}>
        {t(lang, 'staff.login_title')}
      </h1>

      {error && (
        <div style={{ marginBottom: 'var(--bo-space-4)' }}>
          <Banner variant="error">{error}</Banner>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 'var(--bo-space-4)' }}>
          <label
            htmlFor="staff-email"
            style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--bo-space-2)' }}
          >
            {t(lang, 'staff.email_label')}
          </label>
          <input
            id="staff-email"
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bo-input"
          />
        </div>

        <div style={{ marginBottom: 'var(--bo-space-5)' }}>
          <label
            htmlFor="staff-password"
            style={{ display: 'block', fontWeight: 600, marginBottom: 'var(--bo-space-2)' }}
          >
            {t(lang, 'staff.password_label')}
          </label>
          <input
            id="staff-password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bo-input"
          />
        </div>

        <div className="bo-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {loading ? t(lang, 'common.sending') : t(lang, 'staff.signin_button')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
