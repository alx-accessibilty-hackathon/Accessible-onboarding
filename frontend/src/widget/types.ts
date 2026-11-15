// Attributes of <bridge-onboarding> (settings in). See TECHNICAL_PLAN.md 2.5.
export interface WidgetProps {
  partner?: string; // publishable partner key, e.g. pk_demo_savanna (not a secret)
  api?: string; // API origin; empty = same site
  flow?: string; // signup | jobs | job-application | profile | language | resume
  lang?: string; // starting language: am | en
  simple?: boolean | string; // start in Simple mode: `simple` or simple="true"
  manageTitle?: boolean | string; // manage-title="false" turns off page-title updates
  jobId?: string; // job-id, for flow="job-application"
  resumeToken?: string; // resume-token, for flow="resume" or direct resume
  /** Set by r2wc: the shadow root we render into (its host is the custom element). */
  container?: ShadowRoot | HTMLElement;
}

/**
 * A yes/no attribute. r2wc drops attributes with an empty value, so a bare `simple` only shows
 * up on the host element itself: read it from there when the prop is missing.
 */
export function readFlag(
  value: boolean | string | undefined,
  host: Element | null | undefined,
  attribute: string,
  fallback: boolean,
): boolean {
  if (typeof value === 'boolean') return value;
  const raw =
    value ?? (host?.hasAttribute(attribute) ? (host.getAttribute(attribute) ?? '') : null);
  if (raw === null) return fallback;
  return !/^(false|0|no|off)$/i.test(raw.trim());
}
