# KTx-CONNECT · DEAP minimum working prototype

An installable, responsive React + TypeScript web app based on the supplied DEAP one-pager and KTx-CONNECT demo. All profiles and records are fictional. The patient UI is in plain English.

## Run locally (Windows PowerShell)

Requirements: Node.js 22.12+ or 24+, npm, a modern browser.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the URL Vite prints. For an existing checkout with the lockfile, use `npm.cmd ci`.

## Build, verify and preview the installable app

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

The production build includes the manifest, 192/512px icons and a versioned offline service worker. Service workers are intentionally not registered in development mode.

Installation requires HTTPS or localhost. In desktop Chrome/Edge choose the install option; on Android use Chrome's Install app menu; on iPhone/iPad open in Safari and choose Share → Add to Home Screen. The in-app installation guide explains these steps and offers the browser's install prompt when available. This is a PWA, not an APK or App Store package. Private hosting authentication may require connectivity even after app assets are cached.

To inspect on a phone on the same network, run `npm.cmd run dev -- --host`. LAN HTTP supports the ordinary demo but normally does not support PWA installation/service workers; use the HTTPS deployment for installation.

## Five-minute walkthrough

1. Overview → Enroll patient. Use fictional details; a sample number is prefilled.
2. Patient profile → Prepare assessment → Open patient link.
3. Select barriers, choose the primary focus, select feasible strategies, review and submit.
4. Switch to Care team, open the new profile, go to Agreed plan and save a jointly agreed sample plan.
5. Overview → Simulate 7 days later. Due follow-up messages are created.
6. Demo messages → open the new patient's check-in → choose a rating and submit a note.
7. Return to the care team view. Status, history, insights and counts update from the response.
8. Settings → Export demo data, larger text, install guide or reset.

You can also use Patient mode and its profile selector for a direct walkthrough without a link.

## Included behavior

- Search and status-filter patient list; summary filters; individual profiles.
- Enrollment and simulated SMS preview with working same-browser links.
- Four-step assessment; illustrative questions, free text and patient-selected priority.
- Feasible strategy preferences; care-team agreed plan; next check-in date.
- Green/yellow/red self-report and optional note; status updates and activity timeline.
- Virtual demo clock; single-use links with a 72-hour simulated lifetime.
- Aggregate insights, JSON export, larger text, responsive layouts and keyboard support.
- Local persistence, same-origin offline app shell, reset and install instructions.

## Mock boundary and extension points

`src/domain.ts` defines records, seed data, labels, status rules and token state.
`src/services.ts` owns mutations and localStorage access. Replace these functions with authenticated API calls when adding a backend. Keep SMS provider secrets in server-side code only.
`src/main.tsx` provides the care team and patient flows. `src/styles.css` defines responsive layouts.
`worker/index.js` provides authenticated server-side SMS test routes and serves the embedded React/PWA assets. The build produces the Sites Worker ESM entrypoint `dist/server/index.js`.
`src/SmsTestPanel.tsx` provides the owner-only real SMS test panel. See [SMS setup](docs/SMS_SETUP.md) for the runtime secrets and delivery verification procedure.
`scripts/build-sw.mjs` generates a cache-versioned service worker from the compiled files.

localStorage is per browser/origin, not a shared database. Patient links refer to local records: they cannot transfer or synchronize records to another device. Installed apps may use a different storage context depending on the platform. Profile-related SMS remains simulated. The separate owner-only technical SMS test can send a real generic message once a live Twilio account and sender are configured. No live provider credentials were available at implementation, so real sending/delivery has not been verified. There are no device alarms or background scheduler. Virtual time advances only when requested in the demo.

Sample questions and strategies are illustrative, not the full validated 14-item BAT or approved MAPS content. The original material must be obtained from the clinical team before clinical use. Patient-selected reminder times are preferences, not medication instructions. A missing check-in is never classified as a missed dose; green responses are self-reports, not verified adherence. Care team plans require clinician agreement; no medicine or dose changes are generated.

The native Site source repository preserves this project and its deployment identity. `.openai/hosting.json` retains the Site ID; the server build replaces static-only hosting with a Worker so runtime secrets are available only server-side. No database is provisioned.
