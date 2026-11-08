# Restora WhatsApp Phase 2 — staging verification

This branch implements API-only WhatsApp ordering. **Do not treat it as production verified** until `bun run check` and the Meta live tests below pass.

## Required setup
- A test restaurant with an active branch, menu categories, available dishes/sizes, and a connected `WhatsAppConnection` row containing its real `phoneNumberId` and an encrypted per-number access token.
- The owner's real `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_TOKEN_ENCRYPTION_KEY` in the server environment. Never commit them. Verify the Meta subscribed webhook points to `https://restora.live/api/v1/webhooks/whatsapp`.
- For typed orders, configure `WHATSAPP_LLM_API_URL`, `WHATSAPP_LLM_API_KEY`, and `WHATSAPP_LLM_MODEL` for an OpenAI-compatible JSON response endpoint. Otherwise interactive MENU still works.
- A separate **customer test number** that can message the restaurant's own WhatsApp Business number. Never use Restora's OTP platform number for restaurant chat.

## Automated check
Run `bun run check` on a checkout of `dev` with dependencies installed. This runs TypeScript typechecking, the local WhatsApp syntax/security lint (`scripts/lint_whatsapp.ts`), and Bun test suites including `tests/whatsapp_phase2.test.ts`, `tests/whatsapp_phase2_unit.test.ts`, and `tests/whatsapp_webhook_integration.test.ts`. The focused safety lint is not a repository-wide ESLint replacement.

## End-to-end test plan
1. **Webhook security/dedupe**: GET with a wrong `hub.verify_token` must return HTTP 403 with `Verification token mismatch`. POST unsigned/wrong HMAC must return 401. Send one real WhatsApp text message from the customer to the connected restaurant number; replay the exact signed POST to verify the Meta message ID is stored once in `WhatsAppMessage` with the right `restaurantId` and `branchId`.
2. **Inbox/reply**: Sign in as a staff member with `orders:view` and `orders:update`. Call `GET /api/v1/whatsapp/conversations` and `GET /api/v1/whatsapp/conversations/{03XXXXXXXXX}?phoneNumberId={restaurant_phone_number_id}`. Call `POST /api/v1/whatsapp/conversations/{03XXXXXXXXX}/reply` with JSON `{"phoneNumberId":"<restaurant_phone_number_id>","text":"Test reply"}`. Verify the response Meta `messageId` and delivery on the customer's phone.
3. **24-hour window**: For an old conversation with its last customer message older than 24 hours, the same reply call must return HTTP 409 and `code: "template_required"`. No free-form Graph message should be sent.
4. **Menu**: From the customer phone send `MENU`; tap a category, a dish, a size if prompted, and quantity. Check all categories, dishes and price labels match **that restaurant's live database**, sold-out dishes are excluded, and menus with more than 10 items paginate.
5. **Confirm**: Read the full priced summary and tap the interactive **Confirm** button. Check a single takeaway order exists for that customer in the restaurant branch with correct `items`, `total`, `clientId`, `whatsappPhone`, `whatsappPhoneNumberId`, and `dailyToken`. Replaying the same signed webhook must not duplicate the order. Plain-text `confirm` must not create an order.
6. **Natural language**: With LLM configuration, send `2 chicken karahi and 1 zinger` for items truly present on the live menu. Check the priced summary appears but no order exists before the tap. Ask for a nonexistent or ambiguous dish and verify clarification rather than substitution or order creation.
7. **Invoice**: After a Confirm, verify the customer receives an itemized bill and PDF document. Compare the amounts to the **stored order** rather than menu prices after a later menu edit. Check that the recipient is the ordering customer's number. If a 24-hour window is expired, only `WhatsAppInvoiceDelivery.status = template_required` is recorded; no free-form invoice is sent.
8. **Optional completion invoice**: An authorized owner/member with `devices:manage` can enable `invoiceOnComplete` using `PATCH /api/v1/whatsapp/connections/{id}` with `{"invoiceOnComplete":true}`. Mark the WhatsApp order `completed`; verify second invoice only if inside window, or a `template_required` record outside it. Never send to an edited customer phone.
9. **Failure/recovery**: Drop network connectivity during a message, PDF upload, and order creation; inspect `WhatsAppMessage.processedAt`, `WhatsAppInvoiceDelivery`, and duplicates. Validate behavior with concurrent Confirm taps and across server restarts.

## Not included
No UI, onboarding, new templates, or payment collection. Sending an approved template from a pending invoice record requires a separate future implementation. Server-side order-processing and Graph integration still require live staging verification.

## Delivery recovery
- Staff with `orders:view` can inspect `GET /api/v1/whatsapp/invoices?status=failed` or `?status=template_required`.
- Staff with `orders:update` can retry an unsent invoice inside a reopened 24-hour window using `POST /api/v1/whatsapp/orders/{orderId}/invoice/retry` with JSON `{"stage":"confirmed"}` (or `"completed"`).
- A `template_required` response means no free-form message was sent. An approved-template sending implementation is intentionally out of scope.
- If Graph accepted a message but the server crashed before recording its returned message ID, an operator retry can resend that particular message. Review the inbox before retrying an uncertain partial delivery.

## Current limitations
- The built-in PDF uses ASCII Courier for portable printability; Urdu and other non-ASCII characters are replaced with question marks. A font-embedding enhancement and real printer/PDF viewer checks are needed before claiming full multilingual invoice support.
- Live Meta Graph API delivery cannot be verified by the mocked integration test. Test real message ID responses, connection credentials, and customer-device receipt in staging.
- Mandatory menu add-ons are not collected through this WhatsApp flow yet. Those dishes require an additional selection step or explicit availability handling before broader rollout.
