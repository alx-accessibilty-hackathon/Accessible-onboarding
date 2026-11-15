# Bridge: accessible sign-up and career gateway

Bridge is a sign-up form that any learning or jobs website can drop into its own pages with **one script tag**. It is built first for people with disabilities in Ethiopia: it works by voice, can read itself aloud, speaks Amharic and English, understands the Ethiopian calendar, keeps answers on the phone when the network drops, and never asks for proof of disability.

Built for the **ALX Digital Bridge Accessibility Hackathon 2026, Track 1 (accessible onboarding)**. Our first host is Savanna, ALX's learning platform, but nothing in Bridge is ALX-specific.

---

## Contents

1. [What Bridge is](#1-what-bridge-is)
2. [Quick start](#2-quick-start)
3. [Integration level 1: one script tag](#3-integration-level-1-one-script-tag)
4. [Integration level 2: REST API](#4-integration-level-2-rest-api)
5. [Integration level 3: JobPosting JSON-LD](#5-integration-level-3-jobposting-json-ld)
6. [Customising](#6-customising)
7. [Running it](#7-running-it)
8. [How it is built](#8-how-it-is-built)
9. [Privacy and security](#9-privacy-and-security)
10. [Accessibility](#10-accessibility)
11. [Project structure](#11-project-structure)

---

## 1. What Bridge is

### Who it is for

- **Learners** who want to sign up for courses and find work, including people who are blind or have low vision, are Deaf or hard of hearing, have a physical disability, have a learning disability, read little, have no national ID, or use a cheap Android phone on a slow or broken connection.
- **Platforms** (partners) such as Savanna or a job board, which want an accessible sign-up without building one.
- **Employers**, who post jobs and say which supports (accommodations) each job offers.
- **Referral organisations** such as AAAPD, which help people who have no ID document.

### What it gives you

| Service | What it does |
|---|---|
| **Sign-up widget** `<bridge-onboarding>` | One question per screen: name, how to contact you, phone, date of birth (Ethiopian or Gregorian calendar), which ID you have (or none), what would help you, then "Check your answers". Saved as you go. |
| **Profile page** | The learner sees, changes or deletes everything we keep about them. |
| **Career gateway** | Jobs filtered by the supports the learner needs (the matching happens on their phone), job details, and applying with the same accessible form. |
| **Employer form** | Employers describe a job and tick the supports it offers; the job is published as schema.org JobPosting. |
| **Staff app** | Employers manage jobs and read applications. Referral-organisation staff see the people who asked them for help and mark their progress. |
| **REST API and partner API** | Every step of the sign-up as an API, plus OAuth 2.0 for a partner's server to read the learners who signed up on its site. |
| **JobPosting JSON-LD** | Every published job in the open schema.org format, with a documented extension for accommodations. |

### Key accessibility features

- **Read aloud, on by default.** Each screen, error, panel and the focused control are read out. Nothing plays until the person presses a key or taps; a notice says so. It can be turned off and stays off.
- **Voice answers.** "Answer by voice" on text, phone and number questions, with a "We heard…" card to check, keep, say again or type instead. An optional "Answer by speaking" mode listens by itself after each question is read.
- **Amharic and English**, each written in its own script, with the **Ethiopian calendar** for dates.
- **Text size from 100% to 400%** inside the widget, and a Simple mode.
- **Works offline.** Answers are kept on the phone and sent when the connection returns.
- **No dead ends for people without ID.** "I have none of these" refers the learner to an organisation that will help.
- **Private support needs.** Encrypted on the server; employers see them only when the learner attaches them to an application.
- **Keyboard and screen reader friendly.** Native HTML controls, focus moved to each new question, one live region, error summary, 48 px targets. The widget never takes focus from the host page on load and never changes the host page's styles or address.

### Built and not built yet

| Area | Built | Not built yet |
|---|---|---|
| Sign-up | Every question and branch, save as you go, offline queue, version check between devices, support needs (encrypted), consent, submit, referral for "no ID" | Duplicate check ("is this you?"), automatic clean-up of old drafts |
| Continue elsewhere | API: resume link and code, lookup, verify; resume screen with `/r/<token>` and 6-char code; Save panel continue cards | Real SMS sending (simulated inbox provided) |
| Learner data | Profile page: see, change, delete, download data (`/me`, `/me/export`) | Sign in with a phone code on a new device |
| Careers | Job list with private needs filter, job detail, apply, employer form, publish, JobPosting JSON-LD, employer reads applications | Importing JobPosting from other boards, a JobPosting feed |
| Staff | Sign-in, employer pages, referral list for partner staff, consent code by SMS (API) | Partner staff registering a learner for them, vouching for ID, support inbox, admin pages, account management, Amharic staff pages |
| Partners | Partner key + allowed origins, OAuth partner API, partner settings in the database | A settings page for partners, per-partner questions, applying the partner's theme colour |
| Speech | Browser speech recognition, server speech-to-text (mock, Azure, local), read aloud with device voice and Azure voices | Recorded read-aloud clips, a local speech-to-text container in Docker Compose, Telegram bot replies |

---

## 2. Quick start

You need Docker. From the repository root:

```bash
cp .env.example .env
# Fill in DATA_ENCRYPTION_KEY and CODE_HASH_KEY (run `openssl rand -base64 32` for each)
# and SEED_STAFF_PASSWORD (any password for the demo staff accounts).
docker compose up --build
```

Then open:

| Page | Address |
|---|---|
| Our hosted sign-up page | http://localhost:8081/ |
| The widget inside demo Savanna pages | http://localhost:8081/demo/savanna/home.html (also `signup.html`, `jobs.html`, `profile.html`) |
| The widget on a deliberately hostile page (shows every event) | http://localhost:8081/demo/plain.html |
| Staff app | http://localhost:8081/staff.html |
| API docs (Swagger UI) | http://localhost:8080/api/docs |
| The widget script for partners | http://localhost:8081/v1/bridge-onboarding.js |

Sign in to the staff app as `employer@example.org` or `staff@aaapd.example` with your `SEED_STAFF_PASSWORD`. Running without Docker is in [section 7](#7-running-it).

---

## 3. Integration level 1: one script tag

### What you need from us

1. **A partner key**, such as `pk_live_acme_7f3k9q`. It is public: it goes in your HTML. It tells our API which partner you are.
2. **Your website's address on our allowed list.** Browsers may use your key only from the origins (scheme + host + port) we have listed for you.
3. **The address of the widget script** and of the API, for example `https://bridge.example/v1/bridge-onboarding.js` and `https://bridge.example`.

There is no self-service page for this yet. The operator of the Bridge server creates the partner in the database.

### For the operator: create a partner and allow its website

Partners live in the `partners` table. `publishable_key` is any unique text; we suggest `pk_` plus random characters (`openssl rand -hex 12`). An origin is written exactly as the browser sends it: scheme, host and port if not the default, with **no path and no trailing slash**. There are no wildcards.

```sql
INSERT INTO partners (slug, name, kind, publishable_key, allowed_origins, config)
VALUES ('acme', 'Acme Learning', 'platform', 'pk_live_acme_7f3k9q',
        ARRAY['https://learn.acme.example'],
        '{"languages": ["am", "en"], "help": {"phone": "+251 11 000 0000", "telegram": "@acme_help"}}');
```

Add or remove an origin later:

```sql
UPDATE partners SET allowed_origins = array_append(allowed_origins, 'https://staging.acme.example')
WHERE slug = 'acme';

UPDATE partners SET allowed_origins = array_remove(allowed_origins, 'https://staging.acme.example')
WHERE slug = 'acme';
```

The partner-key check sees the change at once. The browser permission (CORS) list is reloaded every **2 minutes**, so a new origin can take up to 2 minutes to work (or restart the API).

`kind` is `platform` for a site that hosts the widget, or `referral_org` for an organisation that helps people without ID. **Every** `referral_org` partner is offered to learners who choose "I have none of these".

In development (`APP_ENV=dev`) the API also allows `https://` origins ending in `DEV_ALLOWED_ORIGIN_SUFFIX` (for example a `.trycloudflare.com` tunnel) and every origin in `EXTRA_ALLOWED_ORIGINS`. The demo partners from `bridge seed` allow `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`, `http://localhost:8080` and `http://localhost:8081`.

### Put it in your page

```html
<!-- Where the form should appear -->
<div style="max-width: 40rem">
  <bridge-onboarding
    partner="pk_live_acme_7f3k9q"
    api="https://bridge.example"
    flow="signup"
    lang="am"
  ></bridge-onboarding>
</div>

<!-- Once per page, anywhere (a classic script, not type="module") -->
<script src="https://bridge.example/v1/bridge-onboarding.js" defer></script>
```

The element fills the width of its container, so put it in a container with a sensible maximum width. One script can serve several `<bridge-onboarding>` elements on the same page.

### Attributes

| Attribute | Values | Default | What it does |
|---|---|---|---|
| `partner` | Your partner key | none (calls then fail with `partner_key_missing`) | Sent as `X-Partner-Key` on every API call. |
| `api` | The API's origin, for example `https://bridge.example` (no `/api/v1`) | empty: the same site as the page | Where the widget sends API calls (`<api>/api/v1/…`). Set it whenever the API is not on your own site. |
| `flow` | `signup`, `language`, `jobs`, `job-application`, `profile` | `signup` | Which part to show (see below). Anything else shows "This form is not available." |
| `lang` | A language code with a locale file: `am` or `en` | `en` | The starting language, used only until the person chooses a language on this device. |
| `simple` | Bare `simple`, or `simple="true"`; `"false"`, `"0"`, `"no"`, `"off"` mean off | off | Starts in Simple mode. |
| `manage-title` | `"false"` to turn off | on | Whether the widget may change the page title (see below). |
| `job-id` | A job's ID (UUID) | none | For `flow="job-application"`: the job to apply for. Without it, the job list shows. |

Set the attributes in your HTML. Changing them after the widget has started is not supported: `flow`, `lang` and `simple` are read once at start.

### Flows

| `flow` | What the person sees |
|---|---|
| `signup` | The sign-up. The first time on a device, the language screen comes first (unless your partner settings offer one language only). A person who already started on this device continues where they stopped. After submit, the Done screen offers "Find a job" and "See or change my details". |
| `language` | The language screen first, every time, then the sign-up. |
| `jobs` | The job list with the "Support I need" filter, pre-filled with the needs the learner gave at sign-up on this device. Matching happens on the device. Each job has details and Apply. |
| `job-application` | The application for `job-id`. Only a learner who finished signing up **on this device** can apply; anyone else sees "Finish signing up first" with a Sign up button, and after signing up the Done screen offers "Continue to your job application". |
| `profile` | "My profile": see, change or delete what we keep. It works for the sign-up made on this device; elsewhere it says so (signing in on another device is not built yet). |

The job-application questions are: are these contact details right, why do you want this job, when can you start, and whether to share what would help you with this employer.

### Events

The widget sends DOM events from the `<bridge-onboarding>` element. Every event has `bubbles: true` and `composed: true`, so you can listen on the element or on `document`. `detail` never contains names, phone numbers or support needs; it may contain IDs.

| Event | When | `detail` |
|---|---|---|
| `bridge-onboarding:ready` | Once, when the widget appears | `{ "flow": "signup" }` (the `flow` attribute, or `"signup"`) |
| `bridge-onboarding:step-changed` | A new question shows (sign-up and job application), including the first one | `{ "step": "phone", "index": 4, "total": 11 }` |
| `bridge-onboarding:saved` | An answer was saved on the device, or answers reached the server | `{ "where": "device" }` or `{ "where": "server" }` |
| `bridge-onboarding:support-requested` | The learner's support needs reached the server | `{}` |
| `bridge-onboarding:completed` | The sign-up was submitted | `{ "registration_id": "…", "learner_id": "…" }` |
| `bridge-onboarding:application-submitted` | A job application was sent | `{ "job_id": "…", "application_id": "…" }` |
| `bridge-onboarding:error` | The API refused something (not for being offline) | `{ "code": "origin_not_allowed" }` (an API error code, or `already_applied`, `apply_not_registered`) |

```html
<script>
  document.addEventListener('bridge-onboarding:completed', (event) => {
    // Keep the learner ID to read the learner later with the partner API (level 2).
    console.log('Signed up:', event.detail.learner_id);
    // Don't redirect at once: let the person read the Done screen at their own pace.
  });
  document.addEventListener('bridge-onboarding:error', (event) => {
    console.warn('Bridge error:', event.detail.code);
  });
</script>
```

### Styling and your page

- **Isolated styles.** The widget draws inside a shadow root with its own stylesheet, and its host element starts from `all: initial`. Your CSS can't break it and its CSS can't touch your page. `demo/plain.html` proves it with aggressive `!important` styles.
- **Size.** Text is sized in pixels (18 px, 20 px in Simple mode) times the person's text size, so your page's root font size doesn't change it.
- **Fonts.** The widget asks for `DM Sans`, then `Noto Sans Ethiopic`, `Ebrima`, `Nyala` and the system font. It loads no web fonts itself. If your users' phones lack an Ethiopic font, load Noto Sans Ethiopic on your page; the widget will use it.
- **Colours.** The widget uses its own tested palette (primary red `#cc3636`). The partner `theme` setting is returned by the API but not applied yet.
- **Dialogs** (help, save, consent) are native `<dialog>` elements inside the shadow root.
- **Your page is left alone.** The widget doesn't change your address, history, scroll position or styles, and never moves focus on first load. The only exception is the page title.

### Page title

While a question is on screen, the widget sets the page title to `Question 4 of 11: What is your phone number? – <your title>`, and gives your title back when the flow ends or the widget goes away. This helps screen-reader users know where they are. On a busy page (a card on a dashboard), turn it off with `manage-title="false"`.

### Language, Simple mode, Read aloud, text size

- **Language.** The language screen shows each language in its own script. The choice is kept on the device (`localStorage` key `bo:lang`) and wins over the `lang` attribute next time. The header has a Language button when more than one language is offered. Your `languages` setting limits the choice; without it every language we have is offered.
- **Simple mode** (header button, or the `simple` attribute) makes the text a little larger. It is saved on the learner's account but not restored on the next visit.
- **Read aloud** is on by default because we can't know whether someone can see the screen. Browsers allow no sound before a key press or tap, so a notice at the top says "Press any key or tap anywhere to start listening"; it is also announced to screen readers. The first key press or tap anywhere on the page starts it. Screen-reader users can turn it off with the Read aloud button; it stays off on that device (`bo:read_aloud`). Each piece of text is read by a recorded clip if one exists, else the device's own voice, else our server voice (fixed interface text only). A learner's own answers are only ever read by the device's voice. If no voice exists for the language, it says once that read aloud isn't available in that language on this device.
- **Answer by speaking** (header button, off by default, `bo:answer_by_speaking`): after a question is read, the microphone listens by itself and fills the field. Say again and Type instead stay on screen.
- **Text size**: 100%, 150%, 200%, 300% or 400% (`bo:text_size`). Everything grows and reflows; nothing scrolls sideways.

### Voice input

"Answer by voice" appears on text, long text, phone and number questions (and on single-choice questions in Answer by speaking mode). The first time, the person is asked whether their voice may be sent to a speech service on the internet:

- **I agree**: the browser's own speech recognition is used where it exists (Chrome sends audio to Google, Edge to Microsoft). The consent is also recorded on the account (`cloud_speech`), which lets our server use a cloud provider.
- **Use another way**: the voice is recorded on the device (at most 30 seconds) and sent to our server, which uses only providers that keep audio on our side.

The text is cleaned up for the field (for example "zero nine one one…" becomes `0911 …`) and shown in a "We heard…" card. Recordings are deleted from the device after one try and never stored on the server. The microphone works only on `https://` pages (or `localhost`).

### Offline

Every answer is saved on the device first (IndexedDB database `bridge-onboarding`), then sent. If the connection drops, the status line says "Saved on this phone only", and the widget sends the waiting answers when the browser comes back online and every 30 seconds. A sign-up can even start offline: the account is created when the connection returns. The widget script itself must load once online (there is no service worker or installable app yet).

**What is kept on the device, under your site's origin:** IndexedDB `bridge-onboarding` (the learner token, registration ID, waiting answers, a copy of the answers including support needs, and voice clips until they are sent) and `localStorage` keys `bo:lang`, `bo:read_aloud`, `bo:answer_by_speaking`, `bo:text_size`, `bo:speech_consent`. "Save and finish later → Forget me on this phone" ends the session on the server and deletes the IndexedDB data and the speech consent.

### Content-Security-Policy

If your page sends a CSP header, allow:

| Directive | Add | Why |
|---|---|---|
| `script-src` | the widget's origin (`https://bridge.example`) | the widget script |
| `connect-src` | the API origin | API calls |
| `style-src` | `'unsafe-inline'` | the widget puts a `<style>` element in its shadow root |
| `media-src` | the widget's origin, `blob:` and `data:` | recorded clips, server voice audio, and a tiny silent sound that unlocks audio on phones |

If you send a `Permissions-Policy` header, keep `microphone=(self)` for voice input.

### Hosting the script yourself

```bash
cd frontend
npm ci
npm run build:widget     # writes dist-widget/bridge-onboarding.js (one file, about 360 KB, under 150 KB gzipped)
```

Serve that file anywhere and point `<script src>` at it. Set `api` to the Bridge API origin. Recorded read-aloud clips, when we add them, are looked up next to the script at `audio/<lang>/<key>.mp3`.

---

## 4. Integration level 2: REST API

The full contract is [`api/openapi.yaml`](api/openapi.yaml), served with Swagger UI at **`/api/docs`** on the API server (for example http://localhost:8080/api/docs). This section is the guided tour.

### Basics

- **Base URL:** `<API origin>/api/v1`, for example `http://localhost:8080/api/v1`.
- **JSON** everywhere (snake_case), except `POST /oauth/token` (form-encoded) and `POST /speech/transcriptions` (multipart).
- **IDs** are UUIDs. Step IDs (`full_name`, `phone`…) and flow IDs (`signup`) are text.
- **Times** are RFC 3339 in UTC.

### Who is calling

| Caller | Send | Get it from | Lifetime |
|---|---|---|---|
| A website | `X-Partner-Key: pk_…` (and the browser sends `Origin`, which must be allowed) | the operator | until changed |
| A learner | `X-Partner-Key` **and** `Authorization: Bearer lt_…` | `POST /registrations` or `POST /resume/verify` | 30 days, renewed each time it is used |
| Staff | `Authorization: Bearer st_…` | `POST /auth/staff/login` | 12 hours |
| A partner's server | `Authorization: Bearer pt_…` | `POST /oauth/token` | 1 hour |

Tokens are opaque random strings (not JWTs). The server stores only their SHA-256 hash. A learner token works only together with the key of the partner the learner signed up with (`403 forbidden` otherwise). Calls from curl or a server have no `Origin` header and skip the origin check; the partner key is still required. If a page can't set headers, the partner key may also be sent as `?key=` or `?partner_key=`.

### Sign-up, step by step

The examples use Git Bash or any POSIX shell.

```bash
API=http://localhost:8080/api/v1
KEY=pk_demo_savanna
```

**1. Start.** This creates a draft learner and registration and returns a learner token. Keep the token: it is shown only once.

```bash
curl -s -X POST "$API/registrations" -H "X-Partner-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"flow_id":"signup","language":"en","simple_mode":false}'
```

```json
{ "registration_id": "3f2a9c4e-…", "learner_id": "9a8b7c6d-…", "status": "draft", "current_step": "welcome",
  "session": { "token": "lt_Q2hhbmdlTWVJc1JhbmRvbQ", "expires_at": "2026-12-15T09:30:00Z" } }
```

```bash
REG=3f2a9c4e-…            # registration_id
TOKEN=lt_…                # session.token
H=(-H "X-Partner-Key: $KEY" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
```

**2. Consent.** Record that the learner agreed to the data-use screen (the `consent_data` step itself is not saved as an answer).

```bash
curl -s -X POST "$API/registrations/$REG/consents" "${H[@]}" \
  -d '{"kind":"data_processing","granted":true,"method":"tap"}'
```

**3. Answers.** One `PUT` per question. `base_version` is the `version` of that answer you last saw, or `0` the first time.

```bash
curl -s -X PUT "$API/registrations/$REG/answers/full_name" "${H[@]}" \
  -d '{"value":"Abebe Kebede","input_method":"typed","base_version":0}'
# → {"question_id":"full_name","value":"Abebe Kebede","input_method":"typed","version":1,"updated_at":"…"}

curl -s -X PUT "$API/registrations/$REG/answers/contact_method" "${H[@]}" \
  -d '{"value":"phone","input_method":"choice","base_version":0}'

curl -s -X PUT "$API/registrations/$REG/answers/phone" "${H[@]}" \
  -d '{"value":"0912 345 678","input_method":"typed","base_version":0}'
# → "value":"+251912345678" (cleaned to E.164)

curl -s -X PUT "$API/registrations/$REG/answers/dob" "${H[@]}" \
  -d '{"value":{"calendar":"ethiopian","year":2010,"month":1,"day":15},"input_method":"typed","base_version":0}'
# → "value":{"calendar":"ethiopian","ethiopian":{"year":2010,"month":1,"day":15},"iso":"2017-09-25"}

curl -s -X PUT "$API/registrations/$REG/answers/id_route" "${H[@]}" \
  -d '{"value":"fayda","input_method":"choice","base_version":0}'

curl -s -X PUT "$API/registrations/$REG/answers/id_last4" "${H[@]}" \
  -d '{"value":"4821","input_method":"typed","base_version":0}'
```

A broken rule answers `422` with the step's error code on the field `value`:

```json
{ "status": 422, "code": "validation_failed", "title": "Validation failed",
  "errors": [ { "field": "value", "code": "phone_invalid" } ] }
```

**4. Conflicts between devices (409).** If you send an old `base_version`, someone else (another device) saved first. Nothing is saved, and you get the stored answer:

```bash
curl -s -X PUT "$API/registrations/$REG/answers/full_name" "${H[@]}" \
  -d '{"value":"Abebe K.","input_method":"typed","base_version":0}'
```

```json
{ "status": 409, "code": "answer_conflict", "title": "Answer changed on another device",
  "current": { "question_id": "full_name", "value": "Abebe Kebede", "input_method": "typed",
               "version": 1, "updated_at": "2026-11-15T09:30:12.418Z" } }
```

Show `current` to the person (or adopt it). To overwrite it on purpose, send your value again with `"base_version": 1`. After submit, every change answers `409 already_submitted`.

**5. Support needs (optional, encrypted).** Codes from [`shared/vocab/needs.json`](shared/vocab/needs.json). The answer never repeats them.

```bash
curl -s -X PUT "$API/registrations/$REG/support-request" "${H[@]}" \
  -d '{"needs":["screen_reader","flexible_hours"],"other_text":"Instructions in writing, please.","share_with":{"courses":true,"employers":false}}'
# → {"status":"saved","updated_at":"…"}
```

**6. Progress (optional).** Save where the learner is, so another device can continue there.

```bash
curl -s -X PATCH "$API/registrations/$REG" "${H[@]}" -d '{"current_step":"support_needs"}'   # 204
```

**7. Submit.**

```bash
curl -s -X POST "$API/registrations/$REG/submit" "${H[@]}" -d '{}'
# → {"status":"registered","learner_id":"9a8b7c6d-…","identity_level":"self_declared"}
```

Missing required answers come back as `422` with one entry per step (`{"field":"id_route","code":"required"}`). Submitting twice is safe: you get the same answer.

**8. Read it back.** `GET /registrations/{id}` returns every answer with its version; `GET /me` returns the learner's profile (support needs decrypted for the learner only).

```bash
curl -s "$API/registrations/$REG" "${H[@]}"
curl -s "$API/me" "${H[@]}"
```

#### The sign-up questions

The order and branches come from [`shared/flows/signup.json`](shared/flows/signup.json). Only questions on the learner's path count on submit.

| Step ID | Type | Required | Values and rules | Asked when |
|---|---|---|---|---|
| `full_name` | text | yes | at least 2 characters (`too_short`) | always |
| `preferred_name` | text | no | | always |
| `contact_method` | single choice | yes | `phone`, `telegram`, `partner`, `none` | always |
| `phone` | phone | yes | Ethiopian mobile (`09…`/`07…`, any common spelling), stored as `+2519…`; else `phone_invalid` | contact is `phone` or `telegram` |
| `dob` | date | no | a real date between 1900 and 2100 (`date_invalid`) | always |
| `id_route` | single choice | yes | `fayda`, `kebele_id`, `refugee_id`, `unhcr_proof`, `other_document`, `none` | always |
| `id_doc_type` | single choice | yes | `student_id`, `birth_certificate`, `idir_equb_id`, `kebele_letter`, `driving_licence`, `passport`, `other` | `id_route` is `other_document` |
| `id_upload` | file | no | a JPEG, PNG or WebP photo, at most 1.5 MB, sent as `{"name", "data"}` with `data` a `data:image/…;base64,…` URL (`file_invalid`, `file_too_large`). The server stores it encrypted and only ever returns `{"name"}`. The widget shrinks photos to JPEG first | `id_route` is `other_document` |
| `id_last4` | text | no | exactly 4 letters or digits (`last4_invalid`) | an ID route other than `none`, except documents `kebele_letter` and `other` |
| `referral_partner` | single choice | yes | the `id` of a referral organisation from `GET /config` | `id_route` is `none` |
| `referral_contact` | single choice | yes | `phone`, `telegram`, `in_person` | `id_route` is `none` |
| `support_needs`, `support_other`, `support_share` | | no | sent together with `PUT …/support-request`, not as answers | always |

`input_method` is `typed`, `voice`, `choice` or `partner`. An empty value (`null`, `""`, `[]`) clears an optional answer.

### Partner-server API (read your learners)

A partner's server can read the learners who signed up on its site. This uses OAuth 2.0 client credentials: a `client_id` and a secret, swapped for a 1-hour token.

**For the operator: give a partner a client ID and secret.** The secret is stored as a SHA-256 hash, so give the secret to the partner once and keep only the hash:

```sql
UPDATE partners
SET client_id = 'acme-server',
    client_secret_hash = sha256(convert_to('<a long random secret>', 'UTF8'))
WHERE slug = 'acme';
```

(Make the secret with `openssl rand -base64 32`. The demo partner gets `savanna-demo` from `bridge seed`.)

**Get a token** (form-encoded, never from a browser):

```bash
curl -s -X POST "$API/oauth/token" \
  -d grant_type=client_credentials -d client_id=savanna-demo \
  -d client_secret="$SECRET" -d scope=learners:read
# → {"access_token":"pt_…","token_type":"Bearer","expires_in":3600,"scope":"learners:read"}
```

Errors use the OAuth shape: `400 {"error":"invalid_request" | "unsupported_grant_type" | "invalid_scope"}`, `401 {"error":"invalid_client"}`.

**List and read learners:**

```bash
PT=pt_…
curl -s "$API/partner-api/learners?updated_since=2026-11-15T00:00:00Z&limit=50" -H "Authorization: Bearer $PT"
curl -s "$API/partner-api/learners/9a8b7c6d-…" -H "Authorization: Bearer $PT"
```

```json
{ "items": [ {
    "learner_id": "9a8b7c6d-…", "full_name": "Abebe Kebede", "preferred_name": "Abe",
    "language": "am", "status": "registered", "identity_level": "self_declared",
    "contact": { "method": "phone", "phone": "+251912345678", "verified": false },
    "registered_at": "2026-11-15T09:40:02Z" } ],
  "next_cursor": null }
```

- **Included:** learner ID, full and preferred name, language, status, identity level, contact method, phone (if any) and whether it was verified (never, today), registration time.
- **Never included:** support needs, ID route, document type or last 4 characters, date of birth, sign-up answers, referrals, consents.
- The list has only learners of **your** partner who **finished** signing up, newest first, at most `limit` (1–200, default 50). `cursor` is accepted but paging isn't built yet, so use `updated_since` to fetch only changes since your last call. Another partner's learner is `404`.
- Match learners to your own users with the `learner_id` from the `bridge-onboarding:completed` event.

### Staff API (short)

- `POST /auth/staff/login` `{"email","password"}` → `{"token":"st_…","role":…}`; `GET /auth/staff/me`; `POST /auth/logout`.
- **Employers** (role `employer`): `GET /employer/jobs`, `POST /employer/jobs` (draft with `accommodations`), `POST /employer/jobs/{id}/publish` (returns `jsonld_url`), `GET /employer/jobs/{id}/applications` (support needs only where the applicant attached them; each read is audit-logged).
- **Partner staff** (role `partner_staff`): `GET /partner/referrals`, `PATCH /partner/referrals/{id}` `{"status":"in_progress"|"closed"}`, `POST /partner/registrations/{id}/consent-code` (texts a 6-digit code to the learner's own phone).

Staff accounts are created by the operator (there is no account page yet). With PostgreSQL's `pgcrypto` extension:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO employers (name) VALUES ('Acme Hiring') RETURNING id;   -- note the id
INSERT INTO staff_users (email, password_hash, display_name, role, employer_id)
VALUES ('hr@acme.example', crypt('<password>', gen_salt('bf')), 'Acme HR', 'employer', '<employer id>');
-- partner staff: role 'partner_staff' and partner_id = the partner's id instead of employer_id
```

### Errors

Every error has one shape (the OAuth token endpoint excepted):

```json
{ "status": 403, "code": "origin_not_allowed", "title": "This website may not use this partner key",
  "errors": [ { "field": "…", "code": "…" } ] }
```

Program against `code`; `title` is a short English hint and may be missing; `errors` appears on `422`.

| Status | Codes |
|---|---|
| 400 | `invalid_request` (unreadable body), `invalid_id` (an ID in the path is not a UUID) |
| 401 | `partner_key_missing`, `partner_key_invalid`, `unauthorized` (token missing, wrong kind, expired or revoked; wrong staff email or password), `resume_check_failed` (with `attempts_left`) |
| 403 | `origin_not_allowed`, `forbidden`, `insufficient_scope` |
| 404 | `not_found` (also for other people's things, so IDs can't be probed), `resume_not_found` |
| 409 | `answer_conflict` (with `current`), `already_submitted`, `already_exists` (applied twice), `not_registered` (`PATCH /me` before submit) |
| 410 | `resume_expired` |
| 413 | `payload_too_large` (voice clip over 3 MB) |
| 422 | `validation_failed` with `errors[]`: `required`, `too_short`, `too_long`, `invalid`, `invalid_choice`, `email_invalid`, `phone_invalid`, `date_invalid`, `digits_invalid`, `last4_invalid`, `unknown_question`, `unknown_step` |
| 429 | `rate_limited` (with `Retry-After`), `too_many_attempts` |
| 500 | `internal_error` (details are logged, never sent) |
| 503 | `speech_unavailable` |

### Rate limits

Per API process, in memory: **120 requests a minute per IP**, **1000 requests every 10 seconds** for the whole server, and **20 a minute per IP** on staff sign-in, OAuth tokens, starting a registration and resume lookup/verify. Over the limit you get `429 rate_limited` and a `Retry-After` header in seconds. Running several API processes multiplies the limits.

### Pagination

Lists look like `{ "items": [...], "next_cursor": "…" | null }`. Today only `GET /jobs` pages: pass `next_cursor` back as `?cursor=` until it is `null` (`limit` 1–100, default 20). The other lists return everything (or up to `limit`) with `next_cursor: null`.

---

## 5. Integration level 3: JobPosting JSON-LD

Every published job is available, with no key, as [schema.org JobPosting](https://schema.org/JobPosting):

```
GET <API origin>/api/v1/jobs/{id}/jobposting.jsonld        Content-Type: application/ld+json
```

The employer gets this address back when they publish (`jsonld_url`) and in the staff app.

```json
{
  "@context": ["https://schema.org", { "acc": "https://bridge.example/ns/accommodations#" }],
  "@type": "JobPosting",
  "acc:offers": ["remote_work", "screen_reader", "large_text", "own_device", "flexible_hours"],
  "applicantLocationRequirements": { "@type": "Country", "name": "Ethiopia" },
  "datePosted": "2026-11-14",
  "description": "Build and fix pages on our websites with HTML, CSS and JavaScript. …",
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "@type": "Organization", "name": "Example Co" },
  "jobBenefits": "Supports we offer: remote work; tools and documents that work with screen readers; screen magnification and large-print materials; use of your own assistive device or software; flexible hours and breaks.",
  "jobLocationType": "TELECOMMUTE",
  "title": "Junior Web Developer",
  "workHours": "Mon–Fri, flexible hours"
}
```

- **Standard properties:** `title`, `description`, `hiringOrganization`, `datePosted`, `employmentType` (`FULL_TIME`, `PART_TIME`, `CONTRACTOR`, `INTERN`, `TEMPORARY`), `workHours`, and `jobLocation` with a `PostalAddress` in Ethiopia. Remote jobs get `jobLocationType: TELECOMMUTE` and `applicantLocationRequirements`.
- **Accommodations.** schema.org has no property for workplace accommodations, so we use both:
  - `jobBenefits`: plain English that every JobPosting reader understands;
  - `acc:offers`: our extension, the list of codes, so a machine can match them to a person's needs. The `acc` prefix is `PUBLIC_WEB_URL` + `/ns/accommodations#` (an identifier; no page is served there yet).

| Code | Meaning (as written in `jobBenefits`) |
|---|---|
| `screen_reader` | tools and documents that work with screen readers |
| `large_text` | screen magnification and large-print materials |
| `sign_language` | a sign language interpreter for interviews and meetings |
| `captions` | captions and written notes for meetings |
| `step_free` | step-free building access |
| `accessible_toilet` | an accessible toilet |
| `flexible_hours` | flexible hours and breaks |
| `remote_work` | remote work |
| `extra_time` | extra time for tests and tasks |
| `written_instructions` | written, plain-language instructions |
| `quiet_space` | a quiet workspace |
| `own_device` | use of your own assistive device or software |
| `person_to_help` | a named support person or mentor |

The same codes are the learner's needs in [`shared/vocab/needs.json`](shared/vocab/needs.json) (learners may also choose `other`, which employers can't offer and which never matches).

**How a job board uses it.** Fetch the JSON-LD from your server (browsers on other sites are blocked by CORS unless their origin is allowed), store it, and put it in the job's page inside `<script type="application/ld+json">` so search engines see it. To match, treat a job as a full match when its `acc:offers` contains every need the person chose, and a partial match otherwise; this is what our widget does on the learner's phone. Importing JobPosting from other boards and a JobPosting feed are not built yet.

---

## 6. Customising

### Partner settings

Each partner has a JSON `config` column. `GET /api/v1/config` returns it, with defaults for what is missing.

| Field | Example | Default | Used by the widget today? |
|---|---|---|---|
| `languages` | `["am","en"]` | `["am","en"]` | **Yes:** the languages offered (only those with a locale file). With one language, the language screen is skipped. |
| `default_language` | `"am"` | `"am"` (or the first language if `am` is not offered) | Not yet: the widget starts in the device's chosen language, then the `lang` attribute, then English. |
| `id_routes` | `["fayda","kebele_id","none"]` | all six routes | Not yet: the widget shows the routes in the flow file. |
| `help` | `{"phone":"+251 11 000 0000","telegram":"@acme_help"}` | none | **Yes:** the "Get help" panel and the "no organisations" message. |
| `theme` | `{"primary":"#0b6e4f"}` | `{"primary":"#cc3636"}` | Not yet. |
| `speech` | `{"server":true,"cloud_available":false}` | from `STT_PROVIDERS` | Not yet (returned for information). |

Set them with SQL (there is no settings page yet):

```sql
UPDATE partners
SET config = config || '{"languages": ["am"], "help": {"phone": "+251 11 222 3333", "telegram": "@acme_help"}}'::jsonb
WHERE slug = 'acme';
```

The new settings show the next time the widget loads.

### Questions (flows)

Every form is a JSON file in [`shared/flows/`](shared/flows): `signup.json`, `job-application.json`, `employer-job.json`. **Both the widget and the API read the same file**: the widget to draw one step per screen, the API to know which answers exist, which are required and how to check them. A mistake in a flow file stops the API at start-up.

```json
{
  "id": "phone",
  "type": "phone",
  "title": "signup.phone.title",
  "hint": "signup.phone.hint",
  "icon": "smartphone",
  "autocomplete": "tel",
  "required": true,
  "storage": "answer",
  "validate": [{ "rule": "phone_et", "error": "phone_invalid" }],
  "next": "dob"
}
```

- **`type`:** `info`, `consent`, `text`, `long_text`, `phone`, `date`, `digits`, `single_choice`, `multi_choice`, `check_answers`, `done`.
- **`title`, `hint`, option `label`:** keys in the locale files (`frontend/src/i18n/locales/*.json`), never text.
- **`storage`:** `answer` (saved with `PUT …/answers/{id}`), `support` (encrypted support request) or `none` (stays on the device).
- **`validate`:** `min_length`, `max_length`, `pattern`, `digits`, `phone_et`, `date_valid`, each with the error code to show.
- **`options`** for choices (`value`, `label`, `icon`, optional `say` words for voice), or **`options_from`**: `vocab:needs` or `config:referral_partners`.
- **`next`:** a step ID, or a list of `{ "when": { "step": "contact_method", "in": ["phone","telegram"] }, "goto": "phone" }` rules checked in order (a rule without `when` always matches).
- **`version`:** a registration remembers the flow version it started with.

**What a partner can change today, honestly:** nothing by themselves. Flows are built into the widget script and loaded by the API at start-up, so changing questions means editing the file, rebuilding the widget and restarting the API, done by us. Only the `signup` flow can be started through the API, and every partner gets the same questions. Per-partner flows, a settings page, and extra partner questions are planned, not built.

### Languages

Every file in `frontend/src/i18n/locales/` is a language (Amharic and English today, both complete). To add one, copy `en.json` to `<code>.json`, have a native speaker translate it (never machine translation), set `language.name` (the name in its own script) and `language.speech_tag` (for example `om-ET`), rebuild the widget, and add the code to the partner's `languages`. Missing keys show in English. See [`frontend/README.md`](frontend/README.md).

### The needs list

[`shared/vocab/needs.json`](shared/vocab/needs.json) is the one list of supports used for learners' needs, the job filter, employers' accommodations and JobPosting `acc:offers`. Adding a code means adding its learner and employer wording to every locale file, its JobPosting wording in `backend/Usecase/jobposting.go`, then rebuilding and restarting.

---

## 7. Running it

### What you need

- **Go 1.24** (the module says `go 1.24`; use `GOTOOLCHAIN=local` so Go doesn't download another toolchain)
- **Node 22 or newer** (Docker uses 22, CI uses 24)
- **PostgreSQL 16 or 17** (local, Docker, or hosted such as Neon)
- **ffmpeg** on the API machine for server speech-to-text (the Docker image has it)
- On Windows, **Git Bash** for the shell commands

### Locally, step by step

1. **Database.** Create an empty database, for example `bridge` owned by user `bridge` with password `bridge`.
2. **Settings.**
   ```bash
   cd backend
   cp .env.example .env
   ```
   Set `DATABASE_URL`, `DATA_ENCRYPTION_KEY` and `CODE_HASH_KEY` (run `openssl rand -base64 32` once for each), and `SEED_STAFF_PASSWORD`.
3. **Tables, demo data, API.**
   ```bash
   go run . migrate             # apply every migration (embedded in the binary)
   go run . seed --if-empty     # demo partners, staff, jobs; prints the keys and accounts
   go run .                     # the API on http://localhost:8080 (same as `go run . serve`)
   ```
4. **Frontend**, in a second terminal:
   ```bash
   cd frontend
   npm ci
   npm run dev                  # http://localhost:5173; /api is forwarded to :8080
   ```
   Open http://localhost:5173/ (sign-up), `/demo/savanna/home.html`, `/demo/plain.html` and `/staff.html`.

The API binary has three commands: `serve` (default), `migrate`, and `seed` (`--if-empty` does nothing when partners already exist).

### Demo data from `seed`

| What | Value |
|---|---|
| Partner keys | `pk_demo_savanna` ("Savanna (demo)", platform), `pk_demo_jobboard` ("Job board (demo)", platform), `pk_demo_aaapd` (AAAPD, referral organisation) |
| Allowed origins (all three) | `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`, `http://localhost:8080`, `http://localhost:8081` |
| Staff accounts (password `SEED_STAFF_PASSWORD`, or a random one printed once) | `employer@example.org` (employer, Example Co), `staff@aaapd.example` (partner staff, AAAPD), `staff@savanna.example` (partner staff, Savanna), `support@example.org` (support), `admin@example.org` (admin) |
| OAuth client | `savanna-demo`, secret `SEED_CLIENT_SECRET` (or a random one printed once) |
| Jobs | 6 published jobs from Example Co with different accommodations |
| Partner settings | languages `am`, `en`; help `+251 11 000 0000` and `@bridge_help_demo` |

Only AAAPD is a referral organisation, so `staff@aaapd.example` is the account that sees referrals. Support and admin accounts can sign in but have no pages yet.

### Settings (environment variables)

The API reads these once at start (`backend/Config/config.go`), from the environment or `backend/.env`.

| Variable | Needed | Default | What it is, and how to get it |
|---|---|---|---|
| `DATABASE_URL` | **required** | | PostgreSQL URL, for example `postgres://bridge:bridge@localhost:5432/bridge?sslmode=disable` |
| `DATA_ENCRYPTION_KEY` | **required** in practice | | 32 random bytes in base64: `openssl rand -base64 32`. Encrypts support needs. Without a valid key the API starts but refuses to save support needs. Never change it once data exists (old data can't be decrypted). |
| `CODE_HASH_KEY` | strongly recommended | | `openssl rand -base64 32`. Keys the hash of resume and consent codes. Empty = a zero key (development only). |
| `APP_ENV` | optional | `dev` | `dev` or `production`. `dev` turns on `GET /api/v1/dev/messages`, the tunnel and extra origins below, and the Telegram webhook without a secret. |
| `PORT` | optional | `8080` | |
| `PUBLIC_WEB_URL` | optional | `http://localhost:5173` | The public site address, used in resume links, JobPosting links and the `acc` namespace. |
| `FLOWS_DIR` | optional | `../shared/flows` | Folder of flow files. |
| `NEEDS_FILE` | optional | `../shared/vocab/needs.json` | The needs list. |
| `STT_PROVIDERS` | optional | empty (no server speech-to-text) | Comma list tried in order: `mock`, `azure`, `local`. `mock` returns sample text and needs nothing. |
| `STT_TIMEOUT_MS` | optional | `8000` | Time limit per provider try. |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | optional | | For Azure speech-to-text and the server voice. In the Azure portal create a **Speech** resource (the free F0 tier is enough to try), then open **Keys and Endpoint**: copy **Key 1** and the **Location/Region** (for example `westeurope`). |
| `LOCAL_STT_URL` | optional | | Base URL of a local speech-to-text server (the API posts the WAV to `<url>/inference`). |
| `SMS_PROVIDER` | optional | `console` | Only `console` exists: messages are logged and listed by `/api/v1/dev/messages`, never really sent. |
| `DEV_ALLOWED_ORIGIN_SUFFIX` | optional, dev only | | For example `.trycloudflare.com`: any `https://…<suffix>` origin may use the widget. |
| `EXTRA_ALLOWED_ORIGINS` | optional, dev only | | Comma list of more origins, for example a phone on your Wi-Fi `http://192.168.1.20:5173`. |
| `TELEGRAM_WEBHOOK_SECRET` | optional | | Checked against Telegram's `X-Telegram-Bot-Api-Secret-Token`. |
| `SEED_STAFF_PASSWORD` | for `seed` | random, printed | Password of every demo staff account. |
| `SEED_CLIENT_SECRET` | for `seed` | random, printed | OAuth secret of `savanna-demo`. |
| `TEST_DATABASE_URL` | tests only | | Any empty database; turns on the database and end-to-end tests. |
| `GIN_MODE` | optional | debug | Gin's own setting; use `release` in production. |

Frontend (`frontend/.env.local`, build time): `VITE_API_PROXY_TARGET` (where the dev server forwards `/api`, default `http://localhost:8080`) and `VITE_API_ORIGIN` (API origin for the staff app; empty = same site). The widget gets its API origin from the `api` attribute.

Docker Compose reads the root `.env`: `DATA_ENCRYPTION_KEY`, `CODE_HASH_KEY` and `SEED_STAFF_PASSWORD` are required; `SEED_CLIENT_SECRET`, `STT_PROVIDERS`, `EXTRA_ALLOWED_ORIGINS`, `APP_ENV`, `PUBLIC_WEB_URL`, `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are optional.

### Docker Compose

`docker compose up --build` starts three containers:

- `db`: PostgreSQL 16 on port 5432 (data in the `dbdata` volume)
- `api`: the Go API on port 8080; on every start it runs `migrate`, `seed --if-empty`, then `serve`
- `web`: nginx on port 8081 with the hosted pages, the staff app, the demo pages and the widget file at `/v1/bridge-onboarding.js`; it forwards `/api/` to the API, so the pages need no CORS

To start from empty: `docker compose down -v`.

### Hosted PostgreSQL (Neon and similar)

- Use `sslmode=require` in the URL.
- Neon gives two URLs: **pooled** (the host contains `-pooler`) and **direct**. Run `migrate` and `seed` with the **direct** URL; schema changes should not go through the pooler. The pooled URL is fine for the running API. If you see errors about prepared statements, use the direct URL for the API too.
- The API creates its own connection pool; a small free database is enough for a demo.

### Testing on a phone

- **Same Wi-Fi:** run `npm run dev -- --host`, open `http://<your PC's IP>:5173` on the phone, and add that origin to `EXTRA_ALLOWED_ORIGINS` in `backend/.env` (then restart the API). The microphone will not work over plain `http://`.
- **HTTPS tunnel (microphone works):** install `cloudflared` (Windows: `winget install --id Cloudflare.cloudflared`), then run
  ```bash
  cloudflared tunnel --url http://localhost:5173
  ```
  and open the `https://….trycloudflare.com` address it prints. With `APP_ENV=dev` and `DEV_ALLOWED_ORIGIN_SUFFIX=.trycloudflare.com`, that origin is allowed automatically, and the Vite dev server accepts the host. On Windows, if `cloudflared` is not on your PATH, use the full path:
  ```bash
  "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5173
  ```
  The address changes every time you start the tunnel.

### Tests and checks

```bash
cd backend
gofmt -l .                     # prints nothing when formatted
go vet ./...
GOTOOLCHAIN=local go test ./...     # add TEST_DATABASE_URL=… for the database and end-to-end tests
sqlc diff                      # generated database code is up to date (sqlc 1.31.1)

cd ../frontend
npm run lint && npm run typecheck && npm run format:check
npm test
npm run build && npm run build:widget && npm run size     # size budget: 150 KB gzipped
npx playwright install chromium && npm run e2e             # end-to-end with axe (local only for now)
```

GitHub Actions runs the backend checks and the frontend checks (not the end-to-end tests yet) on pull requests.

### Deploying

- Set `APP_ENV=production` (no dev inbox, no tunnel or extra origins, Telegram webhook only with a secret) and `GIN_MODE=release`.
- Set `PUBLIC_WEB_URL` to your public `https://` address.
- Serve everything over **HTTPS** (put a TLS proxy in front of the `web` container). The microphone needs it.
- Set real partners and their `https://` origins in `partners.allowed_origins`, and don't load the demo data: remove `seed --if-empty` from the `api` command in `docker-compose.yml` (the demo keys allow `localhost` and the demo staff share one password).
- Keep `DATA_ENCRYPTION_KEY`, `CODE_HASH_KEY` and the OAuth secrets out of Git and backed up separately from the database.
- Back up the database (`pg_dump`) and test a restore.
- Rate limits are per process: with several API processes, each has its own limits.

---

## 8. How it is built

```
 Partner page (any site)                         Bridge server
 ┌───────────────────────────────┐              ┌─────────────────────────────────────────┐
 │ <script src=…/bridge-onboarding.js>           │ nginx (web): pages, widget file, /api → │
 │ <bridge-onboarding partner=…> │  HTTPS JSON  │ Go API (Gin)                             │
 │   shadow root: React app      │ ───────────▶ │  middleware: rate limits, CORS,          │
 │   IndexedDB: answers, token   │              │  partner key + origin, tokens, roles     │
 └───────────────────────────────┘              │  controllers → use cases → repositories │
 Partner server ── OAuth token ──▶ /partner-api │  PostgreSQL (sqlc, goose migrations)     │
 Job boards ── JobPosting JSON-LD ◀──────────── │  speech: mock / Azure / local; ffmpeg    │
 Staff browser ── staff.html ─────────────────▶ └─────────────────────────────────────────┘
```

- **Frontend** (`frontend/`): React 18 + TypeScript, built with Vite. The widget is wrapped into a custom element with `@r2wc/react-to-web-component` and an open shadow root, and shipped as one IIFE file. A small **form engine** draws any flow file one step per screen. Separate modules handle read aloud (`src/a11y/`), voice (`src/voice/`), languages (`src/i18n/`), offline (`src/offline/`) and the staff app (`src/staff/`).
- **Backend** (`backend/`): Go 1.24, Gin, PostgreSQL with pgx, database code generated by sqlc, migrations in goose format embedded in the binary. Clean layers: controllers (HTTP and DTOs) → use cases (rules and permission checks) → repositories (SQL), with outside services (speech, SMS, encryption) in `Infrastructure/`.
- **Shared** (`shared/`): the flow files and the needs list, read by both sides.
- **Contract:** [`api/openapi.yaml`](api/openapi.yaml) (OpenAPI 3.0.3), served by the API at `/api/openapi.yaml` and `/api/docs`.

**Where AI is used.** Only for speech: turning voice into text (the browser's speech recognition, or our server's providers) and reading text aloud (device voices or Azure neural voices). Job matching, answer checks and the clean-up of what was heard are plain rules, not AI.

---

## 9. Privacy and security

### What we keep

| Data | Where | How it is protected |
|---|---|---|
| Name, preferred name, contact method, phone (E.164), date of birth and calendar, language, Simple mode, identity level | `learners` | database access only |
| Sign-up answers, each with a version | `answers` | database access only |
| ID route, document type, last 4 characters | `identity_evidence` | the last 4 characters are never returned by any API |
| Photo of an "other document" (optional, `id_upload`) | `answers` (the value holds the file name and the ciphertext) | **AES-256-GCM**, the learner and the question as additional data; no API returns the photo, only its name. Nothing reads it yet |
| Support needs and free text | `support_requests` | **AES-256-GCM**, the learner ID as additional data (a copied row won't decrypt for another learner); only the sharing choices are plain |
| Consents (yes or no, how, when) | `consents` | |
| Learner, staff and partner-server tokens | `auth_sessions` | **SHA-256 hash only** |
| Resume link tokens and codes, consent codes | `resume_tokens`, `verification_codes` | SHA-256 (link) and **HMAC-SHA256 with `CODE_HASH_KEY`** (codes); single use, 72 hours (resume) or 10 minutes (consent), 5 tries |
| Staff passwords | `staff_users` | **bcrypt**; unknown email and wrong password answer the same way |
| OAuth client secrets | `partners.client_secret_hash` | SHA-256, compared in constant time |
| Simulated SMS and Telegram messages | `messages_outbox` | plain text, and logged (see below) |
| Audit log (learner deleted, support needs read) | `audit_log` | no personal data |
| Voice recordings | **never stored** | deleted from the phone after one try, never written on the server |

Things to know: the simulated messages (`messages_outbox` and the API log) contain the phone number and the resume or consent code in plain text, because real sending isn't built; there is no automatic clean-up of old drafts or messages yet; and phone numbers are never verified yet.

### Consent

- The sign-up starts with a plain-language consent screen; agreeing is recorded as `data_processing`.
- Voice: the person chooses between a speech service on the internet (recorded as `cloud_speech`) and recording on the device for our server only. The server uses a cloud provider only with that consent.
- Support needs: the learner chooses who else may see them (course teachers, employers when applying), and is asked again on each job application before an employer can see them.
- The learner can see, change and delete their data on the profile page. Deleting removes everything about them in one transaction.

### Who can see what (as built)

| Caller | Can | Cannot |
|---|---|---|
| A website (partner key) | read partner settings and published jobs, start a sign-up, resume lookup and verify, read fixed text aloud | read any learner's data |
| Learner (`lt_`) | their own registration, answers, support request, consents, submit, voice transcription, apply for jobs (once registered), see, change and delete their profile | anyone else's data; their token doesn't work with another partner's key |
| Employer (`employer`) | their own jobs (with drafts), create and publish, applications to their own jobs, support needs **only** where the applicant attached them (each read audit-logged) | other employers' jobs (404), learner lists, ID details |
| Partner staff (`partner_staff`) | referrals to their own organisation (name, contact, language), set progress, text a consent code to their own or referred learners | ID details, support needs, other organisations' referrals (404) |
| Support, admin | sign in only (no pages yet) | |
| Partner server (`pt_`, `learners:read`) | its own registered learners: names, language, status, identity level, contact | support needs, ID details, date of birth, answers |

The partner whose site a learner signed up on can read that learner's profile through the partner API; there is no separate "partner access" consent step yet.

### Other protections

Strict allowed origins per partner key, CORS limited to those origins, rate limits (stricter on sign-in, tokens, new sign-ups and resume), parameterised SQL (sqlc), errors that never leak internals, request body limits (voice clips 3 MB), and the widget's shadow root, which keeps it and the host page apart.

---

## 10. Accessibility

We aim at **WCAG 2.2 AA**. What is built in:

- **One question per screen** with the question as the page's `h1`; the label is the heading (GOV.UK pattern); native `input`, `button`, `fieldset` and `dialog` only.
- **Focus** moves to each new heading after Continue (never on first load); an **error summary** gets focus and links to the field; answers are checked on Continue, not while typing.
- **One live region** for status messages; nothing is announced twice.
- **Read aloud** on by default, started by the first key press or tap, reading screens, errors, dialogs, the focused element and whole option groups. Learners' own words are read only by the device's voice.
- **Voice input** with a review card, alternatives when unsure, and help when the microphone is blocked.
- **Text size** 100–400% inside the widget, reflow without sideways scrolling, 48 px targets, visible focus, colours with tested contrast (primary `#cc3636`).
- **Amharic** with correct `lang` attributes and taller line height for Ethiopic script; the **Ethiopian calendar** (13 months, Pagume) for dates; Ethiopian phone formats.
- **No time limits**, nothing lost on reload, offline queue, "Forget me on this phone" for shared phones.
- **Help in the same place** on every screen (phone and Telegram from the partner settings).
- A bilingual **404 page** with Read aloud.
- Checks: ESLint with `jsx-a11y`, unit tests, and Playwright end-to-end tests with axe (run locally).

Our manual test checklist covers keyboard only, NVDA and TalkBack, 400% zoom and axe on every screen.

---

## 11. Project structure

```
.
├── api/openapi.yaml            the REST contract (served at /api/openapi.yaml and /api/docs)
├── backend/                    Go API: see backend/README.md
│   ├── main.go                 commands: serve (default), migrate, seed
│   ├── Config/                 every environment variable
│   ├── Domain/                 entities, errors, flow model, interfaces
│   ├── Usecase/                rules and permission checks
│   ├── Repository/             SQL (queries/ → sqlc/), seed data
│   ├── Infrastructure/         middleware, rate limits, encryption, speech, messages, flow loader
│   ├── Delivery/               controllers + DTOs, router
│   └── migrations/             goose migrations (embedded)
├── frontend/                   React + TypeScript: see frontend/README.md
│   ├── src/widget/             the <bridge-onboarding> element, App, events, styles
│   ├── src/engine/ screens/ fields/   the form engine and its screens
│   ├── src/careers/            jobs, filter, apply
│   ├── src/profile/            My profile
│   ├── src/staff/              staff app (staff.html)
│   ├── src/a11y/ voice/ i18n/ offline/   read aloud, voice, languages, offline
│   ├── demo/                   demo host pages (Savanna copies, a hostile plain page)
│   └── 404.html, index.html, staff.html
├── shared/flows/, shared/vocab/needs.json   forms and needs list, read by both sides
├── docker/                     nginx and the web image
└── docker-compose.yml          db + api + web
```

More detail: [`backend/README.md`](backend/README.md) (layers, conventions, sqlc, adding an endpoint) and [`frontend/README.md`](frontend/README.md) (running, adding a language, read aloud and voice).
