import { describe, expect, it } from 'vitest';
import { matchJobs, type Job } from './match';

const mockJobs: Job[] = [
  {
    id: 'job-1',
    title: 'Junior Data Analyst',
    employer: { name: 'Tech Co' },
    location_type: 'hybrid',
    employment_type: 'full_time',
    accommodations: ['screen_reader', 'flexible_hours', 'remote_work'],
  },
  {
    id: 'job-2',
    title: 'Customer Support Specialist',
    employer: { name: 'Support Inc' },
    location_type: 'remote',
    employment_type: 'full_time',
    accommodations: ['screen_reader', 'extra_time'],
  },
  {
    id: 'job-3',
    title: 'Office Assistant',
    employer: { name: 'Gov Agency' },
    location_type: 'onsite',
    employment_type: 'part_time',
    accommodations: ['step_free', 'accessible_toilet'],
  },
];

describe('career matching (matchJobs)', () => {
  it('returns all jobs as matches when selection is empty', () => {
    const results = matchJobs(mockJobs, []);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.isFullMatch)).toBe(true);
    expect(results.every((r) => r.matchedCount === 0)).toBe(true);
  });

  it('correctly identifies full matches', () => {
    // Both screen_reader and flexible_hours are offered by job-1
    const results = matchJobs(mockJobs, ['screen_reader', 'flexible_hours']);
    const fullMatches = results.filter((r) => r.isFullMatch);

    expect(fullMatches).toHaveLength(1);
    expect(fullMatches[0].job.id).toBe('job-1');
    expect(fullMatches[0].matchedCount).toBe(2);
    expect(fullMatches[0].totalSelected).toBe(2);
  });

  it('correctly ranks partial matches below full matches', () => {
    // job-1 offers both (full match)
    // job-2 offers 1 of 2 (partial match)
    // job-3 offers 0 of 2 (no match)
    const results = matchJobs(mockJobs, ['screen_reader', 'flexible_hours']);

    expect(results[0].job.id).toBe('job-1');
    expect(results[0].isFullMatch).toBe(true);
    expect(results[0].matchedCount).toBe(2);

    expect(results[1].job.id).toBe('job-2');
    expect(results[1].isFullMatch).toBe(false);
    expect(results[1].matchedCount).toBe(1);

    expect(results[2].job.id).toBe('job-3');
    expect(results[2].isFullMatch).toBe(false);
    expect(results[2].matchedCount).toBe(0);
  });

  it('never automatically matches "other" need', () => {
    const resultsWithOther = matchJobs(mockJobs, ['screen_reader', 'other']);
    // Since 'other' is ignored, only 'screen_reader' is active
    // job-1 and job-2 offer screen_reader
    const job1 = resultsWithOther.find((r) => r.job.id === 'job-1');
    const job2 = resultsWithOther.find((r) => r.job.id === 'job-2');

    expect(job1?.isFullMatch).toBe(true);
    expect(job1?.totalSelected).toBe(1);
    expect(job2?.isFullMatch).toBe(true);
  });

  it('handles scenario when no job matches any selected need', () => {
    const results = matchJobs(mockJobs, ['sign_language']);
    expect(results.every((r) => !r.isFullMatch)).toBe(true);
    expect(results.every((r) => r.matchedCount === 0)).toBe(true);
  });
});
