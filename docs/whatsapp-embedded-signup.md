# Restora — Restaurant WhatsApp Embedded Signup v4

## Goal
Each restaurant selects its own WhatsApp Business number using Meta's secure onboarding dialog in **Settings → WhatsApp**, completes registration if Meta requires it, and reads/replies to customer messages under **WhatsApp** in the dashboard.

No restaurant uses the Restora OTP number. All Graph access tokens are stored encrypted, never returned to the browser.

## Server-only environment variables

- `WHATSAPP_META_APP_ID` — Meta app ID.
- `WHATSAPP_META_APP_SECRET` — Meta app secret (NEVER put into frontend build).
- `WHATSAPP_META_CONFIG_ID` — Facebook Login for Business **WhatsApp Embedded Signup v4** configuration ID.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` — 32-byte AES-GCM key, 64 hexadecimal characters.
- `WHATSAPP_APP_SECRET` — application secret used to verify webhook signatures.
- `WHATSAPP_VERIFY_TOKEN` — random webhook verification token.
- `CLIENT_ORIGIN` — include the deployed restaurant dashboard origin.

Meta webhook URL: `https://<api-host>/api/v1/webhooks/whatsapp` (must be HTTPS).

## Meta setup still required by the Restora owner

1. Create/verify a Meta Business Portfolio and Tech Provider/Solution Partner onboarding eligibility as applicable.
2. Configure a Meta app with WhatsApp Cloud API and Facebook Login for Business **Embedded Signup v4** (older signup configurations are no longer suitable for new onboarding).
3. Set proper permissions and app review/advanced access: `whatsapp_business_management`, `whatsapp_business_messaging`, and any program-specific requirements.
4. Add the actual dashboard HTTPS origin to Meta SDK allowed domains and valid OAuth redirect URI settings.
5. Configure webhooks, subscribe to the `messages` event, set the verify token, and check signed Meta callbacks.
6. Set backend secrets securely and deploy frontend/backend changes to staging.
7. Connect a real **test restaurant number**, register with a six-digit PIN where required, and complete an end-to-end menu/order/invoice/reply test.

The frontend loads the SDK on demand, calls `FB.login` with the v4 `config_id`, and sends only a one-time code plus claimed WABA/number IDs to the backend.

The backend exchanges the code, validates the WABA/phone using the resulting token, subscribes the Meta app, and encrypts the token in `WhatsAppConnection`. Where Meta omits phone ID for coexistence, it auto-discovers only if the WABA has exactly one number; otherwise it fails closed.

A phone ID already assigned to another restaurant or branch cannot be reassigned silently. Disconnect deletes the token and stops incoming chatbot ordering; it does not unsubscribe the entire WABA (which could affect other assets).

## API routes and permissions

All under `/api/v1/whatsapp`, authenticated and tenant-scoped:

- `GET /signup/config` — public IDs and whether server signup is configured; `devices:manage`.
- `POST /signup/complete` — Meta code exchange and WABA/phone verification; `devices:manage`.
- `POST /connections/:id/register` — six-digit registration PIN; `devices:manage`.
- `POST /connections/:id/disconnect` — clears token, disables sending and inbound processing; `devices:manage`.
- Existing `GET /connections`, `GET /conversations`, `GET /conversations/:phone`, `POST /conversations/:phone/reply` — inbox API.

There is no manual token-entry form; restaurant owners authorize access through Meta.

## Test plan / release blockers

- Unit/integration: run `NODE_ENV=test bun test tests/whatsapp_embedded_signup.test.ts`.
- Verify URL and permissions; no access from an unrelated restaurant or staff member without `devices:manage`.
- Confirm Meta token and registration PIN never appear in API responses or logs.
- Verify invalid codes, expired authorization, forbidden WABA, duplicate phone and Meta API outages.
- Verify one-number coexistence and ambiguous multi-number refusal.
- Verify registration, signed webhook processing, disconnect and reconnect.
- Verify staff inbox read/reply, delivery receipts, 24-hour window and invoice retries.
- Test on desktop/mobile and verify Meta's popup is not blocked.
- Confirm platform Meta approval, real account state, billing/credit arrangements, and any required app coexistence privileges.

**This code does not activate Meta integration automatically.** Approval, credentials, webhooks, domain configuration and live number tests are external release dependencies.
