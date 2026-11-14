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

## Rules (short)

- Native HTML elements. The question is the `h1`. Never use a placeholder as a label.
- Colours only from `--bo-*` tokens in `styles.css`.
- Every string goes in `en.json`. In `am.json`, use `"TODO-am"` until a native speaker translates it (the English shows meanwhile).
- One live region (`announce()`). Dialogs stay inside the shadow root. Never change the host page's address or styles.
- Before merging a screen: keyboard only, NVDA or TalkBack, 400% zoom, and axe (0 serious, 0 critical).

## Status

Skeleton. The sign-up flow shows its first step only, and every screen marked `TODO (FA-…/FB-…)` maps to a task in `TECHNICAL_PLAN.md`. Default language is English until `am.json` is translated (see `src/widget/App.tsx`).
