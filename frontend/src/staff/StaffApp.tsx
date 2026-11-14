import { t } from '../i18n/t';

// Staff pages (normal page, not the widget). SKELETON.
// TODO (FB-9): sign-in (email + password, paste allowed), employer jobs list hosting FA's
// employer-job flow; Should: partner dashboard (E1), support inbox.
export function StaffApp() {
  const lang = 'en';
  return (
    <main className="bo-root" lang={lang}>
      <div className="bo-frame">
        <h1>{t(lang, 'staff.title')}</h1>
      </div>
    </main>
  );
}
