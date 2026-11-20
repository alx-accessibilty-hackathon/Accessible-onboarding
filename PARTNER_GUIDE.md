# Bridge partner guide

Add an accessible sign-up, profile and job search to your platform in an afternoon. This page has everything a platform team needs. The full reference is the [README](README.md) and the API contract [`api/openapi.yaml`](api/openapi.yaml) (Swagger UI at `/api/docs` on the API).

Hosted demo: **https://accessible-onboarding.vercel.app** (the API is behind it at `/api/v1`).

---

## 1. What your users get

- **One question per screen**, in Amharic or English (more languages can be added), with the Ethiopian calendar for dates.
- **Read aloud, on by default.** At the first key press or tap, it reads the page top to bottom, then describes whatever the person moves to with Tab or a tap, and says what to do in each field.
- **Answer by voice.** What is heard goes straight into the field and is said back.
- **One Accessibility menu**: Read aloud, Answer by speaking, text size (100–400%), Simple mode. Get help, Language and Dark mode sit next to it.
- **Works offline.** Answers are kept on the phone and sent when the connection returns.
- **No ID needed.** People without a document are referred to an organisation that helps them.
- **Keyboard only, screen readers, 400% zoom**: native HTML, visible focus, focus moved to each new heading.

## 2. Before you start

Ask the Bridge operator for:

1. **A partner key** (`pk_…`). It is public and goes in your HTML.
2. **Your website's origins on the allowed list**: scheme, host and port, no path, no trailing slash, e.g. `https://learn.your-site.example`. The key works only from those origins.
3. **The script and API addresses.** Hosted demo: script `https://accessible-onboarding.vercel.app/v1/bridge-onboarding.js`, API `https://accessible-onboarding.vercel.app`.
4. **For server access (optional)**: an OAuth `client_id` and secret, to read your learners from your server (step 5).

The operator does this with SQL (README, section 3, "For the operator").

## 3. Add the widget (one script tag)

```html
<div style="max-width: 40rem">
  <bridge-onboarding
    partner="pk_your_key"
    api="https://accessible-onboarding.vercel.app"
    flow="signup"
    lang="am"
  ></bridge-onboarding>
</div>

<!-- Once per page; a classic script, not type="module" -->
<script src="https://accessible-onboarding.vercel.app/v1/bridge-onboarding.js" defer></script>
```

| Attribute | Values | What it does |
|---|---|---|
| `partner` | your partner key | Identifies your platform on every call. |
| `api` | the API origin (no `/api/v1`) | Where the widget sends its calls. |
| `flow` | `signup` (default), `language`, `jobs`, `job-application`, `profile` | Which part to show. |
| `lang` | `am` or `en` | Starting language until the person chooses one. |
| `simple` | `simple` / `"true"` | Starts in Simple mode. |
| `job-id` | a job ID | With `flow="job-application"`. |
| `manage-title` | `"false"` | Stops the widget from setting the page title. |

The widget draws inside its own shadow root: your CSS can't break it and it never changes your page, except the page title (turn that off with `manage-title="false"`).

If your page sends a Content-Security-Policy, allow the script origin in `script-src` and `media-src` (plus `blob:` and `data:`), the API origin in `connect-src`, and `'unsafe-inline'` in `style-src`. Keep `microphone=(self)` in `Permissions-Policy` for voice.

## 4. Listen to events

Events come from the element (`bubbles`, `composed`), so you can listen on `document`. **`detail` never contains names, phone numbers or support needs.**

| Event | `detail` |
|---|---|
| `bridge-onboarding:ready` | `{ flow }` |
| `bridge-onboarding:step-changed` | `{ step, index, total }` |
| `bridge-onboarding:saved` | `{ where: "device" \| "server" }` |
| `bridge-onboarding:completed` | `{ registration_id, learner_id }` |
| `bridge-onboarding:application-submitted` | `{ job_id, application_id }` |
| `bridge-onboarding:error` | `{ code }` (for example `origin_not_allowed`) |

```js
document.addEventListener('bridge-onboarding:completed', (e) => {
  saveBridgeId(currentUser, e.detail.learner_id); // link the learner to your own account
});
```

## 5. Read your learners from your server (optional)

OAuth 2.0 client credentials, scope `learners:read`. Tokens last one hour.

```bash
curl -X POST https://accessible-onboarding.vercel.app/api/v1/oauth/token \
  -d grant_type=client_credentials -d client_id=$CLIENT_ID -d client_secret=$CLIENT_SECRET \
  -d scope=learners:read
# → {"access_token":"pt_…","token_type":"Bearer","expires_in":3600,"scope":"learners:read"}

curl https://accessible-onboarding.vercel.app/api/v1/partner-api/learners?limit=50 \
  -H "Authorization: Bearer pt_…"
curl https://accessible-onboarding.vercel.app/api/v1/partner-api/learners/{learner_id} \
  -H "Authorization: Bearer pt_…"
```

Keep the secret on your server only. `updated_since` returns only learners changed since your last call.

## 6. Exactly what data your platform receives

Only learners who **finished** signing up **on your site**.

| You receive | You never receive |
|---|---|
| `learner_id`, `full_name` (name, father's name, grandfather's name), `preferred_name` (no longer asked, normally empty), `language`, `status`, `identity_level` (`self_declared`), contact method, phone (if given) with `verified: false`, `registered_at` | support needs and the free text about them, date of birth, sex, region, education, ID type, document details or photo, referrals, consents |

- **Support needs** are encrypted on our server. An employer sees them only when the learner chooses to attach them to one application.
- **Identity is not verified.** The optional "last 4 characters" of a document is a reference for staff, not a check, and Bridge never claims otherwise. Real Fayda verification (one-time code through the National ID Program) is on the roadmap.
- The learner can see, change and delete everything on their profile page (`flow="profile"`).

## 7. Jobs and accommodations (JobPosting JSON-LD)

Every published job is public schema.org JobPosting JSON-LD, no key:

```
GET https://accessible-onboarding.vercel.app/api/v1/jobs/{id}/jobposting.jsonld
```

Readable accommodations are in `jobBenefits`; machine-readable codes in `acc:offers`, where `acc` is defined at **https://accessible-onboarding.vercel.app/ns/accommodations** (a schema.org `DefinedTermSet` with one `DefinedTerm` per code). Put the JSON-LD in your job page in `<script type="application/ld+json">`. A job fully matches a person when its `acc:offers` contains every need they chose.

## 8. Your settings

Stored per partner and returned by `GET /api/v1/config`; changes show the next time the widget loads.

| Setting | Example | Effect |
|---|---|---|
| `languages` | `["am","en"]` | Languages offered. One language skips the language screen. |
| `help` | `{"phone":"+251 11 123 4567","telegram":"@your_help"}` | The Get help dialog: **Call support** opens the phone's dialler with the number, **Send an SMS**, **Open Telegram**. |

```sql
UPDATE partners
SET config = config || '{"help": {"phone": "+251 11 123 4567", "telegram": "@your_help"}}'::jsonb
WHERE publishable_key = 'pk_your_key';
```

## 9. Add a language

Every `frontend/src/i18n/locales/<code>.json` is a language. From `frontend/`:

1. `npm run i18n:new -- om "Afaan Oromoo" om-ET` creates the file (every text marked `TODO-om`, shown in English until translated).
2. A native speaker translates it. Never machine translation.
3. `npm run i18n:check -- om` lists missing or untranslated texts and wrong `{placeholders}`.
4. Add `"om"` to your `languages` setting.
5. Optional: read-aloud recordings in `public/audio/om/<key>.mp3` (`npm run audio:check`).
6. `npm run build:widget` and deploy.

## 10. Go-live checklist

- [ ] Partner key, and every production origin on the allowed list (no trailing slash).
- [ ] The widget in a container about 40rem wide; tested with the keyboard only and at 400% zoom.
- [ ] `bridge-onboarding:completed` handled: `learner_id` stored against your user.
- [ ] Real help contacts in your `help` setting.
- [ ] Server access: the OAuth secret on your server only, never in the browser.
- [ ] Operator: `APP_ENV=production` and `PUBLIC_WEB_URL` set to the public site (the API logs a warning otherwise), HTTPS everywhere (the microphone needs it).
- [ ] Free hosting sleeps: the first request after a quiet time can take up to a minute. The widget waits and says "Connecting to the service…". Open the site once before a demo.

Questions or a new partner key: contact the Bridge team.
