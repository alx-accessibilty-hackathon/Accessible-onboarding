import r2wc from '@r2wc/react-to-web-component';
import { setAudioBase } from '../a11y/speaker';
import { App } from './App';

// Recorded read-aloud clips are published next to the widget script (…/audio/<lang>/<key>.mp3),
// so a partner site loads them from our server, not its own. A classic <script src> knows its
// own address; a dev module script doesn't (then: /audio/ on this site).
const script = typeof document !== 'undefined' ? document.currentScript : null;
if (script instanceof HTMLScriptElement && script.src) {
  setAudioBase(new URL('audio/', script.src).href);
}

// <bridge-onboarding partner="pk_…" api="https://…" flow="signup" lang="am"
//                    simple manage-title="false" job-id="…"></bridge-onboarding>
// r2wc turns camelCase props into kebab-case attributes (manageTitle -> manage-title).
// `simple` and `manage-title` are read as strings: App parses them (a bare `simple` = on).
const BridgeOnboarding = r2wc(App, {
  shadow: 'open',
  props: {
    partner: 'string',
    api: 'string',
    flow: 'string',
    lang: 'string',
    simple: 'string',
    manageTitle: 'string',
    jobId: 'string',
  },
});

if (!customElements.get('bridge-onboarding')) {
  customElements.define('bridge-onboarding', BridgeOnboarding);
}
