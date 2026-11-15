import needsVocab from '@shared/vocab/needs.json';
import type { Option, Step } from './types';

export type Audience = 'learner' | 'employer';

export interface ReferralPartner {
  id: string;
  name: string;
}

export interface OptionContext {
  audience?: Audience;
  referralPartners?: ReferralPartner[];
  idRoutes?: string[];
}

/**
 * The options of a choice step: its own list, the needs vocabulary (learner or employer
 * wording; employers never get "other") or the referral partners from GET /config.
 * `literal` labels are names from the server, shown as they are (not language-file keys).
 */
export function resolveOptions(
  step: Step,
  ctx: OptionContext = {},
): Array<Option & { literal?: boolean }> {
  if (step.id === 'id_route' && ctx.idRoutes && ctx.idRoutes.length > 0) {
    const allowed = new Set(ctx.idRoutes);
    return (step.options ?? []).filter((o) => o.value === 'none' || allowed.has(o.value));
  }
  if (step.options_from === 'vocab:needs') {
    const employer = ctx.audience === 'employer';
    return needsVocab.items
      .filter((item) => !(employer && item.code === 'other'))
      .map((item) => ({
        value: item.code,
        label: employer ? item.employer : item.learner,
        icon: item.icon,
      }));
  }
  if (step.options_from === 'config:referral_partners') {
    return (ctx.referralPartners ?? []).map((p) => ({
      value: p.id,
      label: p.name,
      icon: 'handshake',
      literal: true,
    }));
  }
  return step.options ?? [];
}
