// The "Page not found" page (404.html) is plain HTML. This adds the widget's Read aloud to it:
// on by default (unless the person turned it off before, on this site), started by the first
// key press or tap, with the same notice, a Read aloud button and focus reading. Without this
// script the page still works.

import { announce, registerLiveRegion } from '../a11y/announce';
import { describeFocus, readableText } from '../a11y/focusSpeech';
import { getSetting, setSetting } from '../a11y/settings';
import {
  getSpeakerState,
  primeSpeech,
  speak,
  stopSpeaking,
  subscribeSpeaker,
  type SpeechPart,
} from '../a11y/speaker';
import { t } from '../i18n/t';

const LANGS = ['am', 'en'];
const PAGE_LANG = document.documentElement.lang || 'en';

const main = document.querySelector('main');
const toggle = document.getElementById('bo-read-aloud');
const notice = document.getElementById('bo-notice');
const live = document.getElementById('bo-live');

registerLiveRegion(live);

function fillToggle(on: boolean): void {
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', String(on));
  toggle.replaceChildren(
    ...LANGS.flatMap((l, i) => {
      const span = document.createElement('span');
      span.lang = l;
      span.textContent = t(l, 'header.read_aloud');
      if (i === 0) return [span];
      const dot = document.createElement('span');
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = ' · ';
      return [dot, span];
    }),
  );
  if (on) {
    const tick = document.createElement('span');
    tick.setAttribute('aria-hidden', 'true');
    tick.textContent = ' ✓';
    toggle.appendChild(tick);
  }
}

/** The page's text (heading, sentences, links), each part in its own language. */
function pageParts(): SpeechPart[] {
  if (!main) return [];
  const parts: SpeechPart[] = [];
  for (const el of Array.from(main.querySelectorAll('h1, p, a'))) {
    if (el.closest('#bo-notice')) continue;
    parts.push(...readableText(el, PAGE_LANG));
  }
  return parts;
}

let readAloud = getSetting('readAloud');
fillToggle(readAloud);
if (toggle) toggle.hidden = false; // only with this script: without it, it would do nothing

if (notice && readAloud && !getSpeakerState().activated) {
  notice.replaceChildren(
    ...LANGS.map((l) => {
      const p = document.createElement('p');
      p.lang = l;
      p.textContent = t(l, 'read_aloud.notice');
      return p;
    }),
  );
  notice.hidden = false;
  // Screen readers read the live region without any key press.
  window.setTimeout(() => {
    if (!getSpeakerState().activated) {
      announce(LANGS.map((l) => ({ text: t(l, 'read_aloud.notice'), lang: l })));
    }
  }, 1500);
  // After the first key press or tap (once its click or key-up is over): hide the notice.
  const unsubscribe = subscribeSpeaker(() => {
    if (!getSpeakerState().activated) return;
    unsubscribe();
    const hide = () => {
      window.setTimeout(() => {
        notice.hidden = true;
      }, 0);
      ['click', 'keyup', 'touchend'].forEach((type) =>
        document.removeEventListener(type, hide, true),
      );
    };
    ['click', 'keyup', 'touchend'].forEach((type) => document.addEventListener(type, hide, true));
  });
}

// The page is read when it opens (it waits for the first key press or tap).
if (readAloud) void speak(pageParts(), PAGE_LANG, { owner: 'page' });

toggle?.addEventListener('click', () => {
  readAloud = !readAloud;
  setSetting('readAloud', readAloud);
  fillToggle(readAloud);
  if (readAloud) {
    primeSpeech();
    void speak(pageParts(), PAGE_LANG, { owner: 'page' });
  } else {
    stopSpeaking();
    if (notice) notice.hidden = true;
  }
});

// Focus reading: the link or button the person moves to.
document.addEventListener('focusin', (e) => {
  if (!readAloud) return;
  const el = e.target as Element | null;
  if (!el || !(el instanceof Element)) return;
  const parts = describeFocus(el, PAGE_LANG, (e as FocusEvent).relatedTarget as Element | null);
  if (parts.length) void speak(parts, PAGE_LANG, { low: true });
});
