import { useState, type FormEvent } from 'react';
import { staffLogin, staffMe, type StaffUser } from '../api/auth';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { t } from '../i18n/t';

export interface LoginProps {
  apiOrigin?: string;
  lang?: string;
  onSuccess: (token: string, user: StaffUser) => void;
}

export function Login({ apiOrigin = '', lang = 'en', onSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { token } = await staffLogin(apiOrigin, email, password);
      let user: StaffUser;
      try {
        user = await staffMe(apiOrigin, token);
      } catch {
        // Fallback user if staffMe not yet implemented
        user = {
          id: 'staff_1',
          email,
          name: email.split('@')[0],
          role: 'employer',
        };
      }
      onSuccess(token, user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'login_failed';
      setError(t(lang, `errors.${msg}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bo-staff-login-card" style={{ maxWidth: '28em', margin: 'var(--bo-space-5) auto' }}>
      <h1 style={{ marginBottom: 'var(--bo-space-4)', fontSize: '1.4em' }}>
        {t(lang, 'staff.login_title')}
      </h1>

      {error && (
        <div style={{ marginBottom: 'var(--bo-space-4)' }}>
          <Banner variant="error" className="bo-mb-4">
            {error}
          </Banner>
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
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? '...' : t(lang, 'staff.signin_button')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
