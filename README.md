# CareCircle

**Elderly Care & Medication Management Platform** - PromptWars x Catalyst hackathon entry.

CareCircle is a shared care ecosystem built around one simple idea: the elderly person stays at the centre of their own healthcare, with family and caretakers in the loop. A **care circle** is created for one elderly person; family members and caretakers join it with an **invite code + family passcode** - no accounts, no passwords to forget, no app to install.

## What it does

- **Passcode-based shared access** - one care circle per elderly person. The creator gets an invite code and a numeric passcode (shown exactly once) to share with family and caretakers. Everyone sees and manages the same profile.
- **Medication schedules** - add medications with dosage, instructions and daily times; edit or remove them as prescriptions change.
- **One-tap adherence tracking** - today's doses are big, readable cards with Taken / Missed / Skip buttons. A weekly adherence score shows how the routine is going. Every action is attributed ("Taken by Asha") so the whole circle stays informed.
- **Appointments** - track doctor visits with specialty, time, location and notes; upcoming appointments surface on the dashboard.
- **Proactive email reminders (Gmail API)** - a background sweep every minute detects doses due now, doses missed (30+ min overdue and unmarked) and appointments within 24 hours, and emails the circle's notification addresses through the **Gmail API**. Without Google credentials the app keeps working and logs reminders in-app, so the demo never breaks.
- **Circle activity log** - a transparent timeline of who did what: joined, added a medication, marked a dose, updated emails. Collaboration you can audit.
- **Elder-first accessibility** - 18px+ base type, high-contrast palette, big tap targets, semantic HTML with landmarks, skip links, `aria-live` dose status, visible focus rings, fully keyboard-operable, responsive down to small phones.

## Tech

- **Node.js 22 + Express** (single runtime dependency), server-rendered HTML - fast, robust, nothing to break on an old phone.
- **JSON file store with atomic writes** (`src/db.js`) - zero native modules, trivially containerizable, durable across restarts.
- **Security**: passcodes hashed with scrypt + per-circle salt (timing-safe comparison), HttpOnly SameSite session cookies (Secure in production), login rate limiting, strict CSP and security headers, input validation on every form.
- **Testing**: `node:test` integration suite covering auth, passcode rejection, medication CRUD, dose marking, appointments, reminder idempotency and the health check.

## Run locally

```bash
npm install
npm test          # 10 integration tests
npm start         # http://localhost:8080
npm run seed      # optional demo circle (invite code + passcode 4281 printed)
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port (Cloud Run sets this) |
| `DATA_FILE` | `./data/carecircle.json` | Where the JSON store lives |
| `TZ_OFFSET_MINUTES` | `330` (IST) | Local offset used for dose times |
| `REMINDER_INTERVAL_MS` | `60000` | Reminder sweep cadence |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_SENDER` | - | Gmail API reminder emails (optional) |

## Email reminders with the Gmail API

1. In Google Cloud Console, create an OAuth 2.0 client (Desktop type) and enable the **Gmail API**.
2. Generate a refresh token for scope `https://www.googleapis.com/auth/gmail.send` (OAuth playground or a one-off script).
3. Set the four env vars above. The app refreshes access tokens itself and sends via `gmail/v1/users/me/messages/send`.

Until configured, reminders appear in **Settings - Recent reminders** and in server logs.

## Deploy to Netlify

The same Express app also runs as a Netlify Function (`netlify/functions/app.mjs`), with data in **Netlify Blobs** and the reminder sweep as a **scheduled function** (plus a lazy per-request sweep as fallback). Static assets serve from `public/`.

```bash
npm install -g netlify-cli
netlify login
netlify sites:create --name carecircle   # or deploy to an existing site
netlify deploy --dir . --prod
```

No code changes needed: `netlify.toml` routes everything through the function.

## Deploy to Cloud Run

```bash
gcloud run deploy carecircle \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars TZ_OFFSET_MINUTES=330
```

The included `Dockerfile` builds a slim production image (non-root user, `npm ci --omit=dev`). Cloud Run's health checks hit `/healthz`.

## Project layout

```
src/
  server.js     entry point: HTTP + reminder loop
  app.js        Express app factory, routes, security headers, sessions
  auth.js       passcode hashing, rate limiting, sessions, activity log
  care.js       medication schedules, dose materialization, adherence
  reminders.js  due/missed dose and appointment sweep
  gmail.js      Gmail API client (OAuth2 refresh-token flow)
  views.js      server-rendered, accessible HTML
  db.js         atomic JSON store
public/styles.css
test/app.test.js
Dockerfile
```

## Demo credentials

After `npm run seed`: circle for **Asha Shinde**, passcode **4281**, invite code printed by the seed script.
