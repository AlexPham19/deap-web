# KTx-CONNECT — DEAP working prototype

An installable, responsive React + TypeScript web app based on the supplied DEAP one-pager and KTx-CONNECT demo. Use fictional clinical details. The patient interface is in plain English.

## Live demo

- [Open KTx-CONNECT](https://ktx-connect-deap-alex.coppercarp65.chatgpt.site/)
- [Open the Connected care workspace](https://ktx-connect-deap-alex.coppercarp65.chatgpt.site/#/shared) — requires an active care team membership and your own ChatGPT sign-in.

The public demo was checked and returned HTTP 200 on November 4, 2026. Patient assessment/check-in links work without an account; only someone with a valid private link can open the corresponding form. Hosting availability may change independently of this repository.

## Shared workflow

Open **Connected care** (`/#/shared`) and sign in with your own invited ChatGPT account. This workspace uses a shared D1 database; the original local demo remains separate.

1. Create a fictional patient display name. The server uses the authorized test phone number.
2. Copy or open the private assessment link on another browser/device. The patient needs no account or app download.
3. Complete the assessment. The owner workspace polls for new responses every 10 seconds.
4. Save the agreed plan, then create a check-in link. The patient sees the plan and shares a green/yellow/red response and optional note.
5. Refresh/reopen the owner workspace: responses remain stored on the server.

Links expire after 72 real hours, are consumed when a response is saved, and can be revoked. Creating a replacement invalidates the earlier unused link of the same type. The database stores hashes rather than raw link tokens. Treat the copied link as private access to that form.

**SMS:** a real generic Twilio trial-template test was delivered during setup. The configured newer Trial mode does not allow custom text or patient URLs, so **Send SMS with link is disabled with an explanation**. Copy/open works independently of SMS. The custom-message server integration is implemented but has not been verified with an eligible live sender. No account upgrade or purchase was performed. See [SMS setup](docs/SMS_SETUP.md).

## Team accounts and access

**Connected care → Team & access** provides email-bound invitation links, Admin/Clinician/Coordinator roles, member disablement, patient assignments and a persistent activity log. Each member signs in/out with their own ChatGPT account; every role can access clinical records only for assigned patients. Optional SMS OTP protects individual patient forms. Live OTP requires `TWILIO_VERIFY_SERVICE_SID`; without it, an OTP-required form stays locked.

See [Team access guide](docs/TEAM_ACCESS.md) for setup, permissions, audit semantics and verification limits.

## Run locally (Windows PowerShell)

Requirements: Node.js 22.13+ or 24+, npm, a modern browser. Node's SQLite API is used only for the local preview/tests; production uses D1.

Clone the project:

```powershell
git clone https://github.com/AlexPham19/deap-web.git
cd deap-web
```

Install, verify and run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Open `http://127.0.0.1:5175/#/shared`. Preview uses a clearly labeled local owner identity stub, a fictional phone fixture and persistent SQLite in ignored `.sites-runtime/care-preview.sqlite`. It does not provide production authentication or live SMS credentials. `npm.cmd run dev` now also provides the local shared APIs through the development-only Vite middleware, using the same fictional owner and SQLite database.

## Installation and platforms

The production build includes a PWA manifest, icons and a versioned service worker. On desktop Chrome/Edge use Install; on Android use Chrome's Install app menu; on iPhone/iPad use Safari → Share → Add to Home Screen. HTTPS or localhost is required. This is a PWA, not an APK/IPA. Physical-device installation and offline reload have not been verified. Shared forms need network access to read and save responses.

## Original local walkthrough

Overview → Enroll patient → Prepare assessment → Open patient link → complete four steps → care-team Agreed plan → Simulate 7 days later → Demo messages → check-in → updated status. Settings provides local export, larger text, reset and the separate technical SMS test panel. These original records use localStorage and virtual time; their links do not synchronize across devices. They are not the Connected care records.

## Implementation

- `src/SharedCare.tsx`: shared owner workspace and no-account patient forms.
- `worker/care.js`: owner-authorized APIs, expiring token access, server validation, atomic submissions and durable SMS outbox.
- `db/schema.ts`, `drizzle/`: Drizzle schema and generated schema-only migration. Sites applies the migration to binding `DB` on deployment.
- `scripts/local-d1.mjs`: SQLite-backed D1 adapter for local preview and meaningful integration tests.
- `src/domain.ts`, `src/services.ts`: original local demo model/mutations.
- `worker/index.js`: Worker routing and owner-only generic SMS test; build embeds React/PWA assets into `dist/server/index.js`.
- `.openai/hosting.json`: existing Site identity and D1 binding. Runtime secrets stay outside the source tree.

Care team routes validate the trusted hosting identity, active membership, role and patient assignment even though the site is public. The configured owner bootstraps the first admin membership. Patient token routes expose only the relevant form context, not phone numbers, DOB, cohort records or history. Submission retries are idempotent; concurrent responses cannot consume one token twice. There is no background SMS scheduler or device alarm. The seven-day follow-up date is stored; sending remains a manual action.

Questions and strategies are illustrative rather than the full validated 14-item BAT or approved MAPS library. Clinical content and clinical-use readiness require the team's review. Plans are entered by the care team; the app does not generate dose or medication changes. Ratings are patient self-reports, not verified adherence; a missing response is not a missed dose.
