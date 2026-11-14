export interface JobEmployer {
  name: string;
}

export interface Job {
  id: string;
  title: string;
  employer: JobEmployer;
  location_type: 'onsite' | 'remote' | 'hybrid';
  location_text?: string;
  work_hours?: string;
  employment_type: string;
  accommodations: string[];
  summary?: string;
  description?: string;
  published_at?: string;
}

export interface MatchedJob {
  job: Job;
  matchedCount: number;
  totalSelected: number;
  isFullMatch: boolean;
}

/**
 * Match jobs against selected learner needs.
 * - Matching happens entirely client-side.
 * - 'other' never matches automatically.
 * - A job is a full match only when it offers EVERY selected need.
 * - Returns full matches first, then partial matches sorted by matched count descending.
 */
export function matchJobs(jobs: Job[], selectedNeeds: string[]): MatchedJob[] {
  // Exclude 'other' from automatic accommodation matching
  const activeNeeds = selectedNeeds.filter((need) => need !== 'other');
  const totalSelected = activeNeeds.length;

  if (totalSelected === 0) {
    return jobs.map((job) => ({
      job,
      matchedCount: 0,
      totalSelected: 0,
      isFullMatch: true,
    }));
  }

  const results: MatchedJob[] = jobs.map((job) => {
    const jobAccommodations = new Set(job.accommodations || []);
    let matchedCount = 0;

    for (const need of activeNeeds) {
      if (jobAccommodations.has(need)) {
        matchedCount++;
      }
    }

    const isFullMatch = matchedCount === totalSelected;

    return {
      job,
      matchedCount,
      totalSelected,
      isFullMatch,
    };
  });

  // Sort: full matches first, then by matched count descending, then by publication date or title
  return results.sort((a, b) => {
    if (a.isFullMatch && !b.isFullMatch) return -1;
    if (!a.isFullMatch && b.isFullMatch) return 1;

    if (b.matchedCount !== a.matchedCount) {
      return b.matchedCount - a.matchedCount;
    }

    // Secondary sort: title
    return a.job.title.localeCompare(b.job.title);
  });
}
