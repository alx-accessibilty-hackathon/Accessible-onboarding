// Partner staff: the people who asked their organisation for help (referrals). Staff token,
// role partner_staff. Shapes follow the round 3 contract exactly.

import { apiFetch, type ApiConfig } from './client';

export type ReferralStatus = 'requested' | 'in_progress' | 'closed';

export interface Referral {
  id: string;
  status: ReferralStatus | string;
  contact_preference: 'phone' | 'telegram' | 'in_person' | string;
  created_at: string;
  learner: {
    learner_id: string;
    full_name: string;
    preferred_name: string;
    contact_method: string;
    phone: string;
    language: string;
  };
}

/** Referrals for the staff member's own organisation, newest first. */
export async function fetchReferrals(cfg: ApiConfig): Promise<Referral[]> {
  const res = await apiFetch<{ items: Referral[]; next_cursor: string | null }>(
    cfg,
    '/partner/referrals',
  );
  return res.items ?? [];
}

/** "I'm contacting them" (in_progress) or "Done" (closed). */
export async function updateReferral(
  cfg: ApiConfig,
  id: string,
  status: 'in_progress' | 'closed',
): Promise<Referral> {
  return apiFetch<Referral>(cfg, `/partner/referrals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
