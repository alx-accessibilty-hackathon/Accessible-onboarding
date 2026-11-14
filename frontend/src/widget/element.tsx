import r2wc from '@r2wc/react-to-web-component';
import { App } from './App';

// <bridge-onboarding partner="pk_…" api="https://…" flow="signup" lang="am"
//                    simple="true" manage-title="false" job-id="…"></bridge-onboarding>
// r2wc turns camelCase props into kebab-case attributes (manageTitle -> manage-title).
const BridgeOnboarding = r2wc(App, {
  shadow: 'open',
  props: {
    partner: 'string',
    api: 'string',
    flow: 'string',
    lang: 'string',
    simple: 'boolean',
    manageTitle: 'string',
    jobId: 'string',
  },
});

if (!customElements.get('bridge-onboarding')) {
  customElements.define('bridge-onboarding', BridgeOnboarding);
}
