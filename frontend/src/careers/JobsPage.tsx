import { t } from '../i18n/t';

// SKELETON.
// TODO (FA-8): "Support I need" filter (needs checkboxes), matching in the browser (match.ts),
// announced result count, job cards (title as h2, "Apply for <title>"), job detail.
export function JobsPage({ lang }: { lang: string }) {
  return <h1>{t(lang, 'jobs.title')}</h1>;
}
