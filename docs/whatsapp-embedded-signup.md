# Restora — Restaurant WhatsApp Embedded Signup v4

## Goal
Each restaurant selects its own WhatsApp Business number using Meta's secure onboarding dialog in **Settings → WhatsApp**, completes registration if Meta requires it, and reads/replies to customer messages under **WhatsApp** in the dashboard.

No restaurant uses the Restora OTP number. All Graph access tokens are stored encrypted, never returned to the browser.

## Server-only environment variables

- `WHATSAPP_META_APP_ID` — Meta app ID.
- `WHATSAPP_META_APP_SECRET` — Meta app secret (NEVER put into frontend build).
- `WHATSAPP_META_CONFIG_ID` — Facebook Login for Business **WhatsApp Embedded Signup v4** configuration ID.
- `WHATSAPP_META_REDIRECT_URI` — optional exact HTTPS `redirect_uri` used in Meta's OAuth popup if code exchange returns Meta error 100/subcode 36008. Do not set it to a made-up callback route.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` — 32-byte AES-GCM key, 64 hexadecimal characters.
- `WHATSAPP_APP_SECRET` — application secret used to verify webhook signatures.
- `WHATSAPP_VERIFY_TOKEN` — random webhook verification token.
- `CLIENT_ORIGIN` — include the deployed restaurant dashboard origin.

Meta webhook URL: `https://<api-host>/api/v1/webhooks/whatsapp` (must be HTTPS).

## Reserved platform number — never use it for restaurant chats

- Set `WHATSAPP_PLATFORM_PHONE_NUMBER_ID` to Restora's OTP sender phone-number ID. The signup service refuses to attach this ID to a restaurant, and the restaurant webhook ignores events for it.
- For backward compatibility, the old `WHATSAPP_PHONE_NUMBER_ID` is also treated as reserved when the explicit variable is empty.
- Never hardcode the Restora OTP WABA/phone IDs into the dashboard signup request. The backend must verify that the selected restaurant's Meta token can access the claimed WABA and phone number, and must reject the reserved platform number.
- The current full-page OAuth redirect returns only a code and state. If Meta's old configuration omits granular-scope target IDs, code-only signup fails closed. Restore signup only after the flow captures the restaurant's own WABA and phone-number IDs from Meta's selected-account callback or another verified tenant-specific source. Do not substitute the Restora OTP number as a workaround.

## Meta setup still required by the Restora owner

1. Create/verify a Meta Business Portfolio and Tech Provider/Solution Partner onboarding eligibility as applicable.
2. Configure a Meta app with WhatsApp Cloud API and Facebook Login for Business **Embedded Signup v4** (older signup configurations are no longer suitable for new onboarding).
3. Set proper permissions and app review/advanced access: `whatsapp_business_management`, `whatsapp_business_messaging`, and any program-specific requirements.
4. Add the actual dashboard HTTPS origin to Meta SDK allowed domains and valid OAuth redirect URI settings.
5. Configure webhooks, subscribe to the `messages` event, set the verify token, and check signed Meta callbacks.
6. Set backend secrets securely and deploy frontend/backend changes to staging.
7. Connect a real **test restaurant number**, register with a six-digit PIN where required, and complete an end-to-end menu/order/invoice/reply test.

## Troubleshooting Meta OAuth redirect URI mismatch

The error `Meta OAuth redirect URI mismatch` comes from **Meta's code-to-token exchange** at `/oauth/access_token`, not from the webhook and not from the WhatsApp connection list.

1. Open **Meta for Developers → Restora app → App settings → Basic**. Verify the App ID is the same as `WHATSAPP_META_APP_ID`; its secret must match `WHATSAPP_META_APP_SECRET`. The `WHATSAPP_META_CONFIG_ID` must be an **Embedded Signup v4 configuration on that same app**.
2. Open **Facebook Login for Business → Settings → Client OAuth Settings**. Enable Client OAuth Login, Web OAuth Login, Enforce HTTPS, Embedded Browser OAuth Login, Use Strict Mode, and Login with the JavaScript SDK. Allow the origin serving Restora's popup, `app.restora.live`, in **Allowed Domains for the JavaScript SDK**. App Settings → Basic → App Domains should also include the appropriate Restora domain.
3. Under **Valid OAuth Redirect URIs**, allow the *exact redirect_uri supplied in the Meta OAuth dialog*. The Restora page is `https://app.restora.live/settings/whatsapp`, but the JavaScript SDK may generate a different redirect URI. Inspect the Meta popup's `redirect_uri` query parameter in DevTools, without sharing the login URL, authorization code, or tokens. Do not assume the webhook `https://restora.live/api/v1/webhooks/whatsapp` is an OAuth callback.
4. Meta Embedded Signup v4 often permits code exchange without a `redirect_uri`. If Meta still reports a mismatch at the exchange and requires an exact value, configure `WHATSAPP_META_REDIRECT_URI` on the **backend server** with the same HTTPS redirect URI used in the login dialog, not with the browser's current page URL unless they are identical. The backend adds this parameter only when configured. Restart/redeploy the API after changing the environment.
5. Start a completely fresh signup. Authorization codes are one-use; a prior code cannot be replayed.

The full OAuth dialog URL and a Meta code exchange query contain sensitive values and must **not** be posted to support chats or logged.

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
