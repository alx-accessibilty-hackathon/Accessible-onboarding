import { describe, expect, it } from 'vitest';
import { resolveOptions } from './options';
import type { Step } from './types';

describe('resolveOptions', () => {
  const idRouteStep: Step = {
    id: 'id_route',
    type: 'single_choice',
    title: 'signup.id_route.title',
    options: [
      { value: 'fayda', label: 'Fayda' },
      { value: 'kebele_id', label: 'Kebele ID' },
      { value: 'refugee_id', label: 'Refugee ID' },
      { value: 'unhcr_proof', label: 'UNHCR' },
      { value: 'other_document', label: 'Other' },
      { value: 'none', label: 'None' },
    ],
  };

  it('returns all options when idRoutes is not specified', () => {
    const res = resolveOptions(idRouteStep);
    expect(res.map((o) => o.value)).toEqual([
      'fayda',
      'kebele_id',
      'refugee_id',
      'unhcr_proof',
      'other_document',
      'none',
    ]);
  });

  it('returns all options when idRoutes is empty', () => {
    const res = resolveOptions(idRouteStep, { idRoutes: [] });
    expect(res.map((o) => o.value)).toEqual([
      'fayda',
      'kebele_id',
      'refugee_id',
      'unhcr_proof',
      'other_document',
      'none',
    ]);
  });

  it('filters to specified idRoutes and always keeps none', () => {
    // Partner only accepts fayda and kebele_id
    const res = resolveOptions(idRouteStep, { idRoutes: ['fayda', 'kebele_id'] });
    expect(res.map((o) => o.value)).toEqual(['fayda', 'kebele_id', 'none']);
  });

  it('always includes none even if not in the partner list', () => {
    const res = resolveOptions(idRouteStep, { idRoutes: ['refugee_id'] });
    expect(res.map((o) => o.value)).toEqual(['refugee_id', 'none']);
  });

  it('does not filter other steps even if idRoutes is provided', () => {
    const otherStep: Step = {
      id: 'contact_method',
      type: 'single_choice',
      title: 'Contact',
      options: [
        { value: 'phone', label: 'Phone' },
        { value: 'telegram', label: 'Telegram' },
      ],
    };
    const res = resolveOptions(otherStep, { idRoutes: ['fayda'] });
    expect(res.map((o) => o.value)).toEqual(['phone', 'telegram']);
  });
});
