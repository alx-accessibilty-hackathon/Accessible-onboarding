// Attributes of <bridge-onboarding> (settings in). See TECHNICAL_PLAN.md 2.5.
export interface WidgetProps {
  partner?: string; // publishable partner key, e.g. pk_demo_savanna (not a secret)
  api?: string; // API origin; empty = same site
  flow?: string; // signup | resume | jobs | job-application | employer-job | partner-signup
  lang?: string; // starting language: am | en
  simple?: boolean; // start in Simple mode: simple="true"
  manageTitle?: string; // manage-title="false" turns off page-title updates
  jobId?: string; // job-id, for flow="job-application"
}
