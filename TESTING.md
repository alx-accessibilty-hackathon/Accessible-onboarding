# Testing guide

How to run the whole project locally and test it, so we can find and fix problems before the demo. Work through the scenarios in section 4. Report everything you find the way section 6 describes, even small things.

**What is ready:**
- **Sign-up widget:** every question, saving as you go, offline, support needs, submit, and the referral for people with no ID
- **Jobs:** filtering by the support a person needs, and applying
- **Staff:** sign-in; employers create and publish jobs (JobPosting JSON-LD)
- **Partner API:** OAuth token, list and read learners
- **Continue on another device:** links and codes can be created

**Not built yet** (don't report these as bugs):
- the screen that *uses* a resume code or link
- partner staff pages (register a learner, attest, referral queue), the support inbox, and `/me` (see, download or delete my data)
- learner sign-in with a phone code, Telegram replies
- JobPosting import and feed, applying the partner's theme colour
- the staff app in Amharic

---

## 1. Set up (once)

You need Go 1.24, Node 22, Git Bash (on Windows) and PostgreSQL 16 or 17. You can use Docker instead of the last three (option B).

### Option A: run it yourself (best while developing)

1. **Database.** Create an empty database, for example `bridge`, for user `bridge`, password `bridge`.

2. **Backend settings.**

   ```bash
   cd backend
   cp .env.example .env
   ```

   In `.env`, set:
   - `DATABASE_URL=postgres://bridge:bridge@localhost:5432/bridge?sslmode=disable`
   - `DATA_ENCRYPTION_KEY` and `CODE_HASH_KEY`: run `openssl rand -base64 32` in Git Bash once for each.
   - `SEED_STAFF_PASSWORD`: any password you like, shared by all demo staff accounts.
   - `STT_PROVIDERS=mock`: no speech account needed.

3. **Tables and demo data, then the API.** `seed` prints the partner keys and accounts.

   ```bash
   go run . migrate
   go run . seed --if-empty
   go run .
   ```

   The API runs on http://localhost:8080. API docs: http://localhost:8080/api/docs.

4. **Frontend.** In a second terminal:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

   It opens on http://localhost:5173, and `/api` is forwarded to :8080.

### Option B: Docker (closest to the demo)

1. Copy `.env.example` (repository root) to `.env`.
2. Fill in `DATA_ENCRYPTION_KEY`, `CODE_HASH_KEY` and `SEED_STAFF_PASSWORD`.
3. Run `docker compose up --build`.
4. Open http://localhost:8081. The API is on :8080.

The API container migrates and seeds by itself. *Not yet tried on a machine with Docker running. If it fails, report it.*

### Testing on a phone

**On the same Wi-Fi:**
1. Run `npm run dev -- --host` and open `http://<your-PC-IP>:5173` on the phone.
2. In `backend/.env`, add `EXTRA_ALLOWED_ORIGINS=http://<your-PC-IP>:5173`, then restart the API.

**Microphone:** the phone only allows it over HTTPS. Use a tunnel and open the `https://….trycloudflare.com` address it prints. That origin is allowed automatically in dev.

```bash
cloudflared tunnel --url http://localhost:5173
```

### Starting again from empty

Drop and recreate the database, then run `migrate` and `seed` again. In the browser: DevTools → Application → Clear site data. Or use **"Forget me on this phone"** in the widget.

---

## 2. Accounts, keys and pages

| What | Value |
|---|---|
| Partner keys (widget) | `pk_demo_savanna`, `pk_demo_jobboard` |
| Referral organisation | AAAPD |
| Employer | `employer@example.org` (Example Co, owns the 6 demo jobs) |
| Partner staff | `staff@aaapd.example`, `staff@savanna.example` |
| Support / admin | `support@example.org`, `admin@example.org` |
| Staff password | your `SEED_STAFF_PASSWORD` |
| OAuth client (partner server) | `savanna-demo` / your `SEED_CLIENT_SECRET` (or the one `seed` printed) |

| Page | Address (option A) |
|---|---|
| Sign-up widget | http://localhost:5173/ |
| Widget inside the Savanna pages | http://localhost:5173/demo/savanna/home.html, `signup.html`, `jobs.html` |
| Widget on a plain, unstyled page (logs every event) | http://localhost:5173/demo/plain.html |
| Staff app (employers) | http://localhost:5173/staff.html |
| Simulated SMS inbox (dev only) | http://localhost:8080/api/v1/dev/messages |
| API docs | http://localhost:8080/api/docs |

---

## 3. Before every test session

- [ ] Pull the latest `main`, run `go run . migrate` again, and restart both servers.
- [ ] Write down your browser, device, assistive technology (if any) and widget language. You'll need them in reports.

---

## 4. Scenarios

Each scenario has steps and what should happen. Do each one in **English and Amharic**, at least once with **Simple mode** on, and at least once with **keyboard only**.

### 4.1 Sign-up with a phone (main path)

1. Open the sign-up widget. Choose a language and Continue on Welcome.
2. Tick the consent. Enter a name, skip the preferred name, choose **Phone**, and type `0912 345 678`.
3. Enter a date of birth in the **Ethiopian calendar**. Choose **Fayda** and enter 4 digits.
4. Tick two support needs, add a note, choose who may see them, then **Send my answers**.

**Expected:**
- one question per screen, with "Question n of m"
- focus on the new heading after every Continue, and the browser tab title changes
- after sending, Done says you're signed up
- the status bar goes from "Saved on this phone" to "Saved to your account"
- Check answers shows the phone as `+251912345678` and only the questions you were asked

### 4.2 No ID: referral to AAAPD

1. Same as 4.1, but choose **contact: none** and **"I have none of these"** for ID.
2. Pick AAAPD and a way to be contacted.

**Expected:**
- no phone question
- the referral questions appear
- Done names AAAPD

### 4.3 Other document

1. Choose "Another document" and pick a type.
2. Enter the last 4 digits.

**Expected:** the document-type question appears, and the answers are saved.

### 4.4 Mistakes and error messages

Try each of these:
- a 1-letter name
- phone `12345`
- a date that doesn't exist
- 3 digits for the last 4
- Continue on a required question with nothing filled in

**Expected:**
- nothing is checked while you type, only on Continue
- an error summary appears at the top and gets focus; its link moves to the field
- a screen reader announces the error once, not twice
- the messages are in the chosen language

### 4.5 Saving, reload and offline

1. Halfway through, reload the page. You should continue at the same question with your answers kept.
2. DevTools → Network → **Offline**. Answer two questions; the status bar shows offline.
3. Go back online. The answers sync and the status shows saved to your account.

### 4.6 Two tabs (another device saved first)

1. Open the sign-up in two tabs at the same question.
2. Change the answer in tab 1 and continue.
3. Change it differently in tab 2.

**Expected:** tab 2 announces that the answer changed on your other device and shows the saved answer. Nothing is lost silently.

### 4.7 Save panel

1. Open **"Save and finish later"** and get a link and code.
2. Use **"Forget me on this phone"**.

**Expected:**
- a link and a code like `K7M-9P2` appear
- after Forget me, the widget starts again from the beginning and the host page doesn't reload

The screen that *uses* the code isn't built yet. You can check that the code works with the API:

```bash
curl -X POST http://localhost:8080/api/v1/resume/lookup \
  -H "X-Partner-Key: pk_demo_savanna" -H "Content-Type: application/json" \
  -d '{"code":"K7M-9P2"}'
# -> {"registration_id":"…","check":"dob"}
```

### 4.8 Support needs stay private

After 4.1, in `psql`:

```sql
SELECT ciphertext FROM support_requests ORDER BY updated_at DESC LIMIT 1;
```

**Expected:** unreadable bytes only. No answer from the API ever contains the needs.

### 4.9 Jobs and applying

1. After signing up, open http://localhost:5173/demo/savanna/jobs.html. The filter is pre-filled with your needs.
2. Change the filter.
3. Open a job and **Apply**, then **Send my application**.
4. Apply again.
5. Open the jobs page in a **private window** and try to apply.

**Expected:**
- the number of jobs is announced, and full and partial matches are clear
- applying works the first time
- the second time it says you already applied
- in the private window it says "Finish signing up first", with a button to sign up

### 4.10 Employer

1. Open `staff.html` and sign in with a wrong password. You should see a clear error, the same for a wrong email.
2. Sign in as `employer@example.org`. You should see 6 jobs.
3. **Create a job:**
   - an onsite job with no place must ask for the place
   - a remote job must not ask for it
4. Tick supports, then **Publish the job**.

**Expected:**
- Done shows the JobPosting JSON-LD and its link
- the job appears on the learners' jobs page

Paste the JSON into https://validator.schema.org/ and check that it shows **0 errors**.

### 4.11 Widget on a host page

1. Open `/demo/plain.html` and watch the event log: `ready` (once), `step-changed`, `saved`, `completed`, `support-requested`, `application-submitted`. No event may contain names, phone numbers or needs.
2. Check that the widget doesn't change the host page's styles or address.

### 4.12 Voice

1. On a text question, use the **Voice** button.
2. With `STT_PROVIDERS=mock`, a recorded clip comes back as a fixed sample. English: "zero nine one two three four five six seven eight". Amharic: the same digits in Amharic.

**Expected:** a "We heard…" card with Keep, Say again and Type instead. In Chrome, the browser's own speech recognition may be used instead.

### 4.13 Accessibility pass (every screen)

- [ ] **Keyboard only:** you can reach everything with Tab, focus is always visible, and there are no traps.
- [ ] **Screen reader:**
  - NVDA + Firefox or Chrome on Windows, and TalkBack on Android
  - headings, labels, errors and live announcements are read
  - Amharic text is read with an Amharic voice where one exists
- [ ] **Zoom to 400%:** nothing is cut off and there is no sideways scrolling.
- [ ] **axe DevTools:** 0 serious and 0 critical issues.
- [ ] **Targets:** every button and option is at least 48 px.
- [ ] **Simple mode:** large icons, one thing at a time.

### 4.14 Partner API (level 2), with curl

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/oauth/token \
  -d "grant_type=client_credentials&client_id=savanna-demo&client_secret=<secret>&scope=learners:read" \
  | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl http://localhost:8080/api/v1/partner-api/learners -H "Authorization: Bearer $TOKEN"
```

**Expected:** only learners who signed up through Savanna, with no support needs or ID details. A wrong secret gives `401 invalid_client`.

### 4.15 Security spot checks, with curl

| Try | Expected |
|---|---|
| `GET /api/v1/config` without `X-Partner-Key` | 401 |
| `GET /api/v1/config` with the key and `-H "Origin: https://evil.example"` | 403 |
| `GET /api/v1/registrations/<id>` without a token | 401 |
| The same with another learner's token, or with `pk_demo_jobboard` | 403 |
| `GET /api/v1/employer/jobs` with a learner token | 401 |
| Staff login with a wrong password, then a wrong email | the same 401 for both |

---

## 5. Automated checks (run before every pull request)

**Backend:**

```bash
cd backend
gofmt -l .        # must print nothing
go vet ./...
go test ./...     # add TEST_DATABASE_URL=postgres://… to also run the database and end-to-end tests
sqlc diff
```

**Frontend:**

```bash
cd frontend
npm run lint && npm run typecheck && npm run format:check
npm test -- --run
npm run build && npm run build:widget && npm run size
```

---

## 6. Reporting a problem

Open a GitHub issue, one per problem, with:
- **Where:** the page or screen, and the question ID if you know it (for example `phone`)
- **Steps to reproduce:** numbered
- **Expected** and **actual** result
- **Device, browser and assistive technology**, plus language and Simple mode on or off
- a **screenshot or recording**, and for API problems the request and response from DevTools → Network
- **Severity:**
  - **blocker:** can't finish a scenario
  - **major:** wrong data, a security problem, or an accessibility failure
  - **minor**
  - **polish**
- For accessibility issues, the **WCAG criterion** if you know it (for example 2.4.3 Focus Order)

Labels: `frontend`, `backend`, `a11y`, `amharic`, `security`, `docs`.
