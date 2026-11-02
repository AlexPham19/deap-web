# Real SMS test connection

The application now has a server-side SMS API and an owner-only test panel in Settings. No SMS provider credentials were present during implementation. No actual message has been sent or delivered.

## Runtime configuration

Set the following values in the Site runtime environment, not browser code or the repository:

| Variable | Purpose |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account SID from the Twilio Console (`AC…`) |
| `TWILIO_AUTH_TOKEN` | Secret Auth Token; always store as a server secret |
| `TWILIO_FROM_NUMBER` | SMS-capable Twilio sender in E.164 format |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional alternative to `TWILIO_FROM_NUMBER` (`MG…`) |
| `SMS_TEST_TO` | Server-side allowlisted test recipient, already configured for this task |
| `SMS_ADMIN_EMAIL` | Owner's trusted ChatGPT email, already configured for this task |

The recipient and admin values are secrets and are not embedded in the app bundle. Redeploy after changing runtime configuration so the new revision is active. Keep the site's existing access audience: real SMS API routes independently require a signed-in owner, even if the website is public.

For a trial account, verify the recipient in Twilio. A sender must satisfy Twilio/carrier requirements for US SMS; a trial or API key does not guarantee delivery. Use live credentials for an actual SMS: Twilio test credentials cannot deliver a real message.

## Test

1. Sign in to the Site as its owner.
2. Open Settings → Send a real test SMS → Refresh setup.
3. When the configuration shows Connected, click Send one real test SMS.
4. Preserve its message SID/reference. Check delivery status without sending again.
5. Only `delivered` is shown as confirmed delivery. `queued`, `accepted`, `sending`, and `sent` are not delivery confirmation.

The fixed technical message contains no patient data or demo patient link. Patient records are still local to each browser, so existing assessment/check-in messages remain simulated. Real cross-device assessment links require a shared backend datastore and appropriate access controls, a separate next step.

## API and limits

- `GET /api/sms/status`: owner-only configuration status, masked recipient, fixed message preview. Never returns credential values.
- `POST /api/sms/test`: explicit same-origin JSON submission, `requestId` UUID only. Recipient/message cannot be supplied by the browser.
- `GET /api/sms/receipt?sid=…&requestId=…`: fetch provider receipt; verifies recipient and technical-test body.
- Worker-isolate duplicate/cooldown guards reduce accidental repeat clicks. They are not a distributed, durable exactly-once mechanism. Do not use this demo endpoint as a production bulk sender.
- Unknown network results are retained as uncertain and not resent automatically. Reconcile with provider records first.
- No credentials are persisted by the frontend, logged, or included in client assets.

## Local development

```powershell
npm.cmd run build
npm.cmd run preview
```

The preview script uses a clearly identified local owner stub; its configuration status shows missing credentials by default, and no SMS can be sent. If deliberately testing with local credentials, point `SMS_PREVIEW_CONFIG` at an ignored JSON file outside the source tree. Never commit or expose that file. The deployed Worker uses the trusted Sites request identity and server runtime secrets, not the preview stub.

Official references: [Twilio Message API](https://www.twilio.com/docs/messaging/api/message-resource), [Twilio trial restrictions](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account).
