# Frontend (React + TypeScript)

One React app shipped as a web component, `<bridge-onboarding>`, that any site loads with one script tag. Plan: `TECHNICAL_PLAN_LITE.md` (short), `TECHNICAL_PLAN.md` section 4 (detail).

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

1. **Locale file.** Copy `src/i18n/locales/en.json` to `src/i18n/locales/om.json` and have a native speaker translate it. Set `"language.name"` to the language's name in its own script (it is shown on the language screen and read in that language) and `"language.speech_tag"` to its BCP-47 tag (e.g. `om-ET`) for speech recognition and voices. Keys you leave out, or values starting with `TODO-`, show in English. Never ship machine translations.
2. **Partner config.** Add the code to the partner's `languages` list (returned by `GET /config`). The language screen offers the languages in that list that have a locale file; without a list, it offers every locale file.
3. **Recordings (optional).** Put read-aloud clips in `public/audio/<code>/<i18n key>.mp3`, e.g. `public/audio/om/signup.full_name.title.mp3` (`npm run audio:check` lists what is missing). They are served next to the widget script. Without clips, Read aloud uses the device's own voice, then the server voice (`POST /speech/synthesis`, fixed interface text only); if neither has the language, it says once that read aloud isn't available in that language yet.

## Read aloud and Answer by speaking

Settings in the widget header (also shown above the language screen, and on the staff pages), saved on the device.

- **Read aloud** (`src/a11y/speaker.ts`, `modes.tsx`, `focusSpeech.ts`): **on by default** (we can't know at start-up whether someone can see the screen) until the person turns it off. Browsers allow no sound before a gesture, so nothing is said until the first key press, tap or click anywhere on the page (document listener, capture phase, passive); a notice at the top says so and is announced once in the live region. It reads each new screen, errors, panels and the element that gets focus; a group of options (radio/checkbox fieldset, list, calendar choice) is read in full when focus enters it. Each part is said by a recorded clip, else the device voice, else the server voice. The learner's own answers are only ever read by the device voice (requirement Q2). Screen-reader users can turn it off with the Read aloud button (it stays off).
- **Text size** (100% to 400%): scales every text and control (`--bo-scale` in `styles.css`); from 200% padding and headings shrink relatively so words keep the width. The native month list stops growing at 32px so its text is never cut off.
- **Answer by speaking** (`src/voice/VoiceInput.tsx`): listens by itself on text, phone, number and single-choice questions, after the question was read, and puts what it heard into the field. "Say again" and "Type instead" stay on screen.

## Rules (short)

- Native HTML elements. The question is the `h1`. Never use a placeholder as a label.
- Colours only from `--bo-*` tokens in `styles.css`.
- Every string goes in `en.json`. In `am.json`, use `"TODO-am"` until a native speaker translates it (the English shows meanwhile).
- One live region (`announce()`). Dialogs stay inside the shadow root. Never change the host page's address or styles.
- Before merging a screen: keyboard only, NVDA or TalkBack, 400% zoom, and axe (0 serious, 0 critical).

## Status

Skeleton. The sign-up flow shows its first step only, and every screen marked `TODO (FA-…/FB-…)` maps to a task in `TECHNICAL_PLAN.md`. Default language is English until `am.json` is translated (see `src/widget/App.tsx`).
