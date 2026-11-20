// GET /config: what this partner's widget needs (config_dto.go).

import { apiFetch, type ApiConfig } from './client';

export interface PartnerRef {
  id: string;
  name: string;
}

export interface WidgetConfig {
  partner: PartnerRef;
  languages: string[];
  default_language: string;
  id_routes: string[];
  referral_partners: PartnerRef[];
  help: { phone?: string; telegram?: string };
  theme: { primary?: string };
  speech: { server: boolean; cloud_available: boolean };
  /** Real SMS is on: the profile page offers the optional phone check. */
  sms?: { verify_phone: boolean };
}

export async function fetchConfig(cfg: ApiConfig): Promise<WidgetConfig> {
  return apiFetch<WidgetConfig>(cfg, '/config');
}
