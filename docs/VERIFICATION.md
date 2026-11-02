# Shared workflow verification — November 2, 2026

This current section supersedes the historical no-backend/no-delivery statements below.

- All 16 tests pass: four original domain tests, seven SMS tests and five shared-care integration tests using real SQLite and the generated migration.
- Shared tests cover owner authorization; hash-only tokens; minimal no-account form access; assessment → plan → check-in; validation without consuming a token; safe retries; concurrent submission; exact 72-hour expiry; replacement/revocation; and Trial rejection without a provider call.
- TypeScript and the production Vite/Worker build pass.
- Browser walkthrough with the local Worker and real SQLite: create fictional Alex Demo → separate patient page → four assessment steps → submit → owner receives response → save plan → separate check-in page shows plan → send green response/note → reload owner workspace → saved response remains.
- Inspected the shared interface at desktop and 390px width, including the patient check-in form. Screenshots: `shared-care-desktop.png`, `shared-care-response.png`, `shared-patient-mobile.png`.
- Preview authentication is a local owner stub. This walkthrough does not verify production sign-in or a physical second device. Hosted D1 deployment is a separate check.
- One generic Twilio trial-template message was confirmed delivered during account setup. Custom SMS containing a patient link remains blocked by the configured Trial mode; no custom-link SMS was sent.
- No automatic follow-up scheduler, physical PWA installation or verified offline reload. Shared submissions need connectivity.

---

## Historical verification notes
# Verification record

## Passed

- TypeScript type check and Vite production build.
- Four domain tests: full workflow, 72-hour expiry, single-use tokens, missing responses, and assessment validation.
- Manifest parsing, presence of 192px / 512px / maskable PNG icons, generated offline app-shell asset list.
- Browser walkthrough: enrollment → simulated SMS → all four assessment steps → care-team plan → simulated 7 days → check-in → updated care-team status and response.
- Browser reload preserves the completed response and profile in localStorage.
- Reset dialog restores the five fictional sample profiles.
- Install guide opens; Settings reports the registered offline app files ready in the preview browser.
- Phone (390px), tablet (768px) and desktop (1440px) layouts inspected. Tablet/desktop had no document-level horizontal overflow.

## Limits / follow-up checks

- Native installation on an actual Android/iOS device was not performed. This deliverable is an installable web app (PWA), not an APK/IPA.
- Reloading with the local preview server stopped did not render in the embedded preview browser, despite service-worker readiness. Offline navigation must be verified in full Chrome/Edge/Safari and under the deployed private authentication gate. Do not claim verified offline operation yet.
- SMS, time progression and all patient records are mocked. There is no backend or cross-device synchronization.
- The clinical team's complete validated assessment and approved intervention library have not been supplied. The included questions are explicitly labeled illustrative.

Preview screenshots: `dashboard-desktop.jpg` and `patient-mobile.jpg`.

## Server-side SMS addition

- Production build now outputs a Sites Worker containing the React/PWA assets and owner-only SMS API routes.
- Six additional automated SMS tests passed (10 tests total). Provider acceptance/delivery fixtures are mocked; these are not live delivery evidence.
- Verified unauthenticated and non-owner requests are denied, client recipient overrides and cross-origin sends are rejected, and missing credentials produce no outbound provider request.
- Verified repeated requests reuse an in-isolate receipt and uncertain transport outcomes are not automatically retried.
- Browser Settings preview shows missing configuration, a disabled send button and a working Refresh setup action.
- The requested recipient and owner identity are stored in hosted runtime secrets, not source or client assets.
- No Twilio account credentials or activated sender were available; no actual SMS has been sent. Live provider acceptance and delivery remain blocked on account setup.
- The website's current public audience is preserved; the real SMS endpoints separately require the configured owner's trusted sign-in identity.

## Live Twilio account setup and trial attempt

- User-supplied credentials authenticated successfully against Twilio. Account is active and of type Trial. Credentials are stored as hosted server secrets, not source.
- No dedicated SMS numbers or Messaging Services were listed for the account. The newer trial workflow assigns a shared sender per recipient through Twilio Console.
- One live trial-template request to the user-authorized destination was rejected with HTTP 403 / provider code 572003: the request must use the trial From number assigned to that recipient. No message SID was created and no SMS was accepted.
- Added explicit `TWILIO_TRIAL_TEMPLATE=sms_internal_alerts` support without appending custom text. The recipient-assigned `TWILIO_FROM_NUMBER` is still required. Trial receipt verification checks the configured sender and recipient; uncertain trial sends need a message SID from Twilio logs.
- Seven SMS tests plus four workflow tests now pass (11 total). Actual delivery remains unverified until the assigned trial sender is supplied and a request is accepted.

