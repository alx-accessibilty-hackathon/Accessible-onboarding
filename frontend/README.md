# Frontend (React + TypeScript)

One React app shipped as a web component, `<bridge-onboarding>`, that any site loads with one script tag. What it does and how partners use it: the main [`README.md`](../README.md).

## Run

```bash
npm install
npm run dev            # http://localhost:5173 (hosted page), /demo/plain.html, /staff.html
npm test               # unit tests (Vitest)
npm run lint           # ESLint, including accessibility rules (jsx-a11y)
npm run build:widget   # dist-widget/bridge-onboarding.js, the file partners load
npm run size           # fails above 150 KB gzipped
```

- `/api` is sent to the Go API on `localhost:8080`; change it with `VITE_API_PROXY_TARGET` in `.env.local`.
- The co-designer can test on their phone: run `cloudflared tunnel --url http://localhost:5173` and open the address it prints.
- End-to-end tests with axe: run `npx playwright install chromium` once, then `npm run e2e`.

## Where things go (suggested owners)

| Folder                                 | What                                                                                | Owner                        |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `src/widget/`                          | Custom element, root `App`, events (`emit`), `styles.css` (colour tokens)           | FE-B                         |
| `src/shell/`                           | Frame on every screen: header, status bar, save and help panels, language screen    | FE-B                         |
| `src/components/`                      | `Button`, `VisuallyHidden`, and later `Dialog` and `Icon`                           | FE-B                         |
| `src/a11y/`                            | Live region + `announce()` (FE-B); focus and page title (FE-A)                      | both                         |
| `src/engine/`                          | Flow types (contract), `FlowRunner`, then reducer, next, validate                   | FE-A                         |
| `src/screens/`, `src/fields/`          | Question screens, Check your answers, Done; field components                        | FE-A                         |
| `src/careers/`                         | Jobs list, "Support I need" filter, job detail                                      | FE-A                         |
| `src/voice/`                           | Voice input, "We heard" card, clean-up rules (`types.ts` is the contract with FE-A) | FE-B                         |
| `src/i18n/`                            | `t()`, `locales/en.json`, `locales/am.json`                                         | FE-B (everyone adds strings) |
| `src/offline/`                         | IndexedDB store, answers outbox, sync                                               | FE-B                         |
| `src/api/`                             | `client.ts` (FE-B); `jobs.ts`, `employer.ts`, `applications.ts` (FE-A)              | both                         |
| `src/staff/`                           | Staff pages: sign-in, employer jobs, partner dashboard                              | FE-B                         |
| `src/lib/`                             | Ethiopian calendar, phone numbers                                                   | FE-A                         |
| `../shared/flows/`, `../shared/vocab/` | Form definitions and needs list, shared with the backend                            | FE-A                         |

## Adding a language

Languages are data: every file in `src/i18n/locales/` is a language (`src/i18n/registry.ts` finds them). To add one, for example Afaan Oromo (`om`):

1. **Locale file.** `npm run i18n:new -- om "Afaan Oromoo" om-ET` creates `src/i18n/locales/om.json` from `en.json` with every text marked `TODO-om`, and sets `"language.name"` (the language's name in its own script: shown on the language screen and read in that language) and `"language.speech_tag"` (its BCP-47 tag, for speech recognition and voices). A native speaker then translates it. Keys you leave out, or values starting with `TODO-`, show in English. Never ship machine translations.
2. **Check.** `npm run i18n:check -- om` lists missing keys, texts still `TODO-`, extra keys and `{placeholders}` that differ from English; it fails on missing keys or wrong placeholders. `npm run i18n:check` checks every language.
3. **Partner config.** Add the code to the partner's `languages` list (returned by `GET /config`). The language screen offers the languages in that list that have a locale file; without a list, it offers every locale file.
4. **Recordings (optional).** Put read-aloud clips in `public/audio/<code>/<i18n key>.mp3`, e.g. `public/audio/om/signup.full_name.title.mp3` (`npm run audio:check` lists what is missing). They are served next to the widget script. Without clips, Read aloud uses the device's own voice, then the server voice (`POST /speech/synthesis`, fixed interface text only); if neither has the language, it says once that read aloud isn't available in that language yet.
5. **Rebuild** the widget (`npm run build:widget`).

## Read aloud and Answer by speaking

The top bar (`src/shell/WidgetFrame.tsx`) has Get help, Language (opens the language screen), Dark mode and **Accessibility**: a disclosure button (`aria-expanded`) whose panel, right below it, holds Read aloud, Answer by speaking, Text size and Simple mode (`ModeToggles`; the staff pages show the toggles directly). Escape closes it. Settings are saved on the device.

- **Read aloud** (`src/a11y/speaker.ts`, `modes.tsx`, `focusSpeech.ts`): **on by default** (we can't know at start-up whether someone can see the screen) until the person turns it off. Browsers allow no sound before a gesture, so nothing is said until the first key press, tap or click anywhere on the page (document listener, capture phase, passive); a notice at the top says so and is announced once in the live region.
  - **First reading:** the top bar (`FrameReadProvider` in `WidgetFrame`, read from the DOM with `describeElement`), then the screen's own reading (`useAutoRead`), then "Press Tab to go from one item to the next". Once per page.
  - **Focus:** `useFocusSpeech` watches `keydown`/`pointerdown` on `window` (capture, passive). Focus moved by the person (Tab, arrows, Home/End, a tap on the element or its label) is said with `speak(…, { interrupt: true })`, which stops everything, also the first reading; the key or tap that starts read aloud is the exception (said after the first reading). Focus moved by the widget is said with `{ low: true, after: true }`, after what is being said. Fields add their hint and error (`aria-describedby`) and what to do (`speech.hint.*`); any element can add its own with `data-bo-instruction`.
  - It also reads each new screen, errors and panels; a group of options (radio/checkbox fieldset, calendar choice) is read in full when focus enters it, a list says how many options it has. Each part is said by a recorded clip, else the device voice, else the server voice. The learner's own answers are only ever read by the device voice (requirement Q2). Screen-reader users can turn it off in the Accessibility menu (it stays off). Toggles say their new state (`{ interrupt: true }`), and nothing is said while the microphone listens (`holdSpeech`).
- **Text size** (100% to 400%): scales every text and control (`--bo-scale` in `styles.css`); from 200% padding and headings shrink relatively so words keep the width. The native month list stops growing at 32px so its text is never cut off.
- **Answer by voice / Answer by speaking** (`src/voice/VoiceInput.tsx`, `useWebSpeech.ts`): what is heard goes straight into the field and is said back ("We heard: …"); "Say again" and "Type instead" stay on screen. A listening session gives one answer: `useWebSpeech` takes the first final result only, aborts the recogniser at once and reports the answer when the session has ended (or 1.5 s later), so read aloud starts again only once the microphone is closed. Answer by speaking listens by itself on text, phone, number and single-choice questions, after the question was read.

## Rules (short)

- Native HTML elements. The question is the `h1`. Never use a placeholder as a label.
- Colours only from `--bo-*` tokens in `styles.css`.
- Every string goes in `en.json`. In `am.json`, use `"TODO-am"` until a native speaker translates it (the English shows meanwhile).
- One live region (`announce()`). Dialogs stay inside the shadow root. Never change the host page's address or styles.
- Before merging a screen: keyboard only, NVDA or TalkBack, 400% zoom, and axe (0 serious, 0 critical).

## Status

Complete flows: sign-up (every question and branch, Check your answers, submit), language screen, jobs with the private needs filter, job application, My profile (change, download, delete, support passport, vouching code, optional phone check) and continue on another device; plus the staff app (`staff.html`). Amharic and English are complete; Amharic is the default unless the partner or the page sets another language. What is not built yet is listed in the main [`README.md`](../README.md), section 1.
