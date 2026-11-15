// How a job is named on screen and read aloud (job card, job detail, "Read the jobs aloud").
// Job posting text is fixed text written by the employer, not the learner's: any voice may say it.

import needsVocab from '@shared/vocab/needs.json';
import { t } from '../i18n/t';
import type { Job, MatchedJob } from './match';

/** The supports a job offers, in the employer wording of the shared list. */
export function supportLabels(job: Job, lang: string): string[] {
  return (job.accommodations ?? [])
    .filter((c) => c !== 'other')
    .map((code) => {
      const item = needsVocab.items.find((n) => n.code === code);
      return item ? t(lang, item.employer) : code;
    });
}

export function jobLocation(job: Job, lang: string): string {
  return job.location_text || t(lang, `employer.location_type.${job.location_type}`);
}

export function jobType(job: Job, lang: string): string {
  return t(lang, `employer.employment_type.${job.employment_type}`);
}

/** "Offers 2 of 3 supports you chose" ('' when the person chose none). */
export function matchText(m: MatchedJob, lang: string): string {
  if (m.totalSelected === 0) return '';
  if (m.isFullMatch && m.totalSelected === 1) return t(lang, 'jobs.match_all_one');
  return m.isFullMatch
    ? t(lang, 'jobs.match_all', { total: m.totalSelected })
    : t(lang, 'jobs.match_some', { matched: m.matchedCount, total: m.totalSelected });
}

/**
 * One job, said in a few short sentences: title, employer, place, type of work, how many of
 * the chosen supports it offers, then which supports it offers.
 */
export function jobSummary(m: MatchedJob, lang: string): string[] {
  const supports = supportLabels(m.job, lang);
  return [
    m.job.title,
    m.job.employer?.name,
    jobLocation(m.job, lang),
    jobType(m.job, lang),
    matchText(m, lang),
    supports.length > 0
      ? `${t(lang, 'jobs.supports_offered')} ${supports.join(', ')}`
      : t(lang, 'jobs.no_supports_listed'),
  ].filter((s): s is string => !!s);
}
