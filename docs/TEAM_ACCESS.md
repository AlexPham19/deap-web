# Team accounts, assignment controls, activity log and patient OTP

## Use it

1. Open [Connected care](https://ktx-connect-deap-alex.coppercarp65.chatgpt.site/#/shared) and sign in with your own ChatGPT account. The previously configured owner becomes the initial admin and receives legacy patient assignments on first authenticated access.
2. Open **Team & access → Members & assignments**. Enter a teammate's exact account email and select Admin, Clinician or Coordinator. Create an invitation and share the generated link yourself. No invitation email is sent automatically.
3. The recipient signs in with that email and accepts. The link is single-use and expires after 72 hours. A replacement invitation revokes the earlier pending one. Revoke pending invitations from the same panel.
4. Select a patient and save their assigned members. New members initially see no patients. Every clinical API action requires an assignment, including for admins. Admins have a names-only assignment directory; it does not include answers or plans.
5. Change a member's role or disable access. The next request checks the updated membership and assignments. The owner cannot be disabled or demoted through the app.
6. Use **Activity log** to view the actor, action, timestamp and patient reference. Admins see workspace events; other members see their own events. The application provides no edit/delete endpoint for these entries.
7. Use **Sign out** to end the Sites sign-in session. Sign-in/out use hosting-owned routes; this app does not store passwords or implement its own OAuth/session cookies. A `session.access` event records authenticated workspace access, while `session.signout_requested` records a sign-out request rather than claiming confirmation from the identity provider.

## Role matrix

| Action | Admin | Clinician | Coordinator |
|---|---|---|---|
| View assigned clinical records | Yes | Yes | Yes |
| Enroll test patient, create/revoke links, send follow-up SMS | Yes | Yes | Yes |
| Save agreed plan, change OTP requirement | Yes | Yes | No |
| Invite/disable members, change roles, assign patients | Yes | No | No |
| View full workspace operation log | Yes | No | No |
| View own operation log | Yes | Yes | Yes |

The generic technical SMS test in Settings remains restricted to the configured owner, who must also have active admin membership. Patient-linked SMS routes require an assignment and are audited. SMS provider acceptance is not delivery confirmation.

## Optional patient phone verification

A clinician or admin assigned to a patient can enable **Require SMS verification for this patient**. Before verification, the public patient endpoint reveals only the phone's last four digits and verification availability. It never reveals the patient's name, barriers, preferences or plan. Both open and submit enforce verification at the server.

Configure `TWILIO_VERIFY_SERVICE_SID` (`VA...`) as a server runtime secret, using an existing Twilio Verify service and the existing account SID/token. This is a separate service from the fixed-template Trial messaging mode. Verify's account/recipient restrictions still apply; a Trial account must have its recipient verified with Twilio. No service was purchased or account upgraded as part of implementation. No OTP SMS has been sent live.

If the service is missing or sending fails, an OTP-required form stays locked. There is no code printed in the browser, returned to the care team or bypass mode. For this prototype, sending remains restricted to the server's authorized test recipient.

The provider creates and checks the OTP. The app limits requests to one per minute and five per patient per hour, and five checks per challenge. A request reference prevents automatic duplicate sends. Unknown transport outcomes are not retried automatically. Challenges last at most ten minutes; verification proof is random, hash-stored, bound to one patient link and expires no later than the challenge/link. Changing the requirement invalidates previous proofs. Codes and raw tokens are not stored in the activity log or database; verification proof stays only in browser component memory.

## Data and validation

The additive Drizzle migration introduces members, invitations, assignments, audit entries and verification challenges, plus patient flags. It contains schema only. Owner bootstrap assigns existing records in a separate audited transaction, without changing clinical answers or plans. Existing applied migrations are retained unchanged.

Integration tests run against real SQLite with the same generated migrations. They cover invitation email binding/expiry/revocation; member disablement; direct-ID access denial; admin assignment restrictions; coordinator edit denial; audited operations and pagination; OTP unavailable/expiry/rate limits, session binding and provider responses using fixtures. These fixtures are not proof of live OTP delivery or a multi-person sign-in exercise.

Production authentication relies on Sites' trusted `oai-authenticated-user-id` and email. Stable user IDs own memberships and assignments; emails bind invitations. A standalone host must replace this boundary with its own trusted authentication middleware; never accept these headers directly from arbitrary clients. Development Vite/Worker previews use a clearly fictional owner stub and do not send real SMS.

Screenshots: [activity log](team-activity.png), [locked OTP form](patient-otp-gate.png).
