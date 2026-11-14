import { apiFetch, type ApiConfig } from './client';
import type { Job } from '../careers/match';

export const DEMO_JOBS_FIXTURE: Job[] = [
  {
    id: 'demo-job-1',
    title: 'Junior Data Analyst',
    employer: { name: 'Savanna Tech Solutions' },
    location_type: 'hybrid',
    location_text: 'Addis Ababa (Bole)',
    work_hours: 'Mon–Fri, 9:00–17:00',
    employment_type: 'full_time',
    accommodations: ['flexible_hours', 'screen_reader', 'remote_work'],
    summary: 'Clean, analyse and present datasets for training and education programs.',
    description:
      'We are looking for an analytical thinker to assist our data operations team. You will query databases, generate visual reports, and collaborate with team members across departments.',
    published_at: '2026-11-14T10:00:00Z',
  },
  {
    id: 'demo-job-2',
    title: 'Accessibility Quality Tester',
    employer: { name: 'Digital Bridge Hub' },
    location_type: 'remote',
    location_text: 'Remote (Ethiopia)',
    work_hours: 'Flexible schedule (20 hrs/week)',
    employment_type: 'part_time',
    accommodations: ['screen_reader', 'large_text', 'extra_time', 'own_device', 'remote_work'],
    summary: 'Test web and mobile user interfaces using assistive tools and provide feedback.',
    description:
      'Join our quality assurance group to audit accessible workflows, verify screen reader outputs, and ensure compliance with accessibility criteria.',
    published_at: '2026-11-14T09:30:00Z',
  },
  {
    id: 'demo-job-3',
    title: 'Community Support Mentor',
    employer: { name: 'AAAPD Partnerships' },
    location_type: 'onsite',
    location_text: 'Addis Ababa (Arat Kilo)',
    work_hours: 'Mon–Fri, 8:30–16:30',
    employment_type: 'full_time',
    accommodations: ['step_free', 'accessible_toilet', 'person_to_help', 'sign_language'],
    summary: 'Coordinate with learners, assist onboarding, and provide peer mentorship.',
    description:
      'Facilitate community workshops, support new program participants, and work directly with inclusive education coordinators.',
    published_at: '2026-11-14T08:00:00Z',
  },
  {
    id: 'demo-job-4',
    title: 'Junior Frontend Developer',
    employer: { name: 'EthioFintech' },
    location_type: 'hybrid',
    location_text: 'Addis Ababa (Kazanchis)',
    work_hours: 'Mon–Fri, 9:00–18:00',
    employment_type: 'full_time',
    accommodations: ['quiet_space', 'written_instructions', 'own_device', 'flexible_hours'],
    summary: 'Build clean, accessible web components in React and TypeScript.',
    description:
      'Work alongside our engineering team to implement user-facing interfaces with strict accessibility standards and semantic HTML.',
    published_at: '2026-11-14T07:15:00Z',
  },
  {
    id: 'demo-job-5',
    title: 'Digital Content Creator & Captioner',
    employer: { name: 'Creative Bridge Media' },
    location_type: 'remote',
    location_text: 'Remote',
    work_hours: 'Flexible hours',
    employment_type: 'contract',
    accommodations: ['captions', 'written_instructions', 'remote_work'],
    summary: 'Create transcripts, add video captions, and prepare accessible learning assets.',
    description:
      'Produce video captions in Amharic and English, write clear descriptions, and verify multimedia accessibility.',
    published_at: '2026-11-14T06:45:00Z',
  },
  {
    id: 'demo-job-6',
    title: 'Administrative Operations Clerk',
    employer: { name: 'Horizon Logistics' },
    location_type: 'onsite',
    location_text: 'Addis Ababa (Megenagna)',
    work_hours: 'Mon–Fri, 8:00–17:00',
    employment_type: 'full_time',
    accommodations: ['step_free', 'accessible_toilet', 'large_text'],
    summary: 'Organize documentation, manage scheduling, and support front office duties.',
    description:
      'Maintain office filing, process shipment forms, and assist visitors in a fully step-free facility.',
    published_at: '2026-11-14T05:30:00Z',
  },
];

export interface JobsResponse {
  items: Job[];
  next_cursor: string | null;
}

export async function fetchJobs(cfg: ApiConfig): Promise<Job[]> {
  try {
    const res = await apiFetch<JobsResponse>(cfg, '/jobs');
    return res.items || [];
  } catch {
    // If backend is not available, use clearly labelled development fixtures (requirement 13)
    return DEMO_JOBS_FIXTURE;
  }
}

export async function fetchJob(cfg: ApiConfig, id: string): Promise<Job> {
  try {
    return await apiFetch<Job>(cfg, `/jobs/${id}`);
  } catch {
    const found = DEMO_JOBS_FIXTURE.find((j) => j.id === id);
    if (found) return found;
    throw new Error('job_not_found');
  }
}
