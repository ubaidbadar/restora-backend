# WhatsApp inbox, onboarding and push release checklist

## Shipped architecture
- Meta authorizes a restaurant-owned WhatsApp Business Account. The one-time code is exchanged on the API, tokens are encrypted per number, and phone IDs are verified against authorized Graph assets.
- Inbox reads use the signed-in restaurant and branch. Conversations need `orders:view`; manual replies require `orders:update` and an open 24-hour service window. Number onboarding requires `devices:manage`.
- Every staff member has a separate `WhatsAppRead` marker per receiving number and customer. Read acknowledgements advance only through a verified inbound message in that thread.
- An inbound signed Meta webhook persists the message with its unique Meta ID. Only successful first inserts fan out push alerts; retries and delivery-receipt changes do not alert again. The alert does not contain customer phone numbers or message bodies.
- `notifyStaff` reuses the existing push-device membership, permission and branch filters. Web push opens `/whatsapp`; mobile Expo push carries `screen: whatsapp`. **Native mobile navigation to this screen requires a corresponding mobile UI handler; verify it before claiming end-to-end native navigation.**
- Browsers that have Restora open refresh the inbox automatically and show a small in-app alert. The service worker covers background web push after explicit browser notification permission.

## Recheck v3 reliability changes

- API requests use a MongoDB-backed fixed-window limiter: 600 requests/minute per client address across the API, 30 POSTs/minute for public QR writes, and 600 requests/minute for the signed Meta webhook. The counters expire automatically and are shared across API workers.
- The reverse proxy must overwrite `CF-Connecting-IP` or `X-Real-IP`; otherwise the limiter uses the last `X-Forwarded-For` hop. Do not forward a client-supplied value as a trusted address.
- A cart left in `confirming` for more than two minutes is recovered on the customer's next message. Before reclaiming, the handler checks the idempotent order client ID; an already-created order is finalized rather than duplicated.
- Unsupported inbound photos, voice notes, videos, locations and documents receive a clear customer reply directing them to MENU or typed text.
- Hidden deal components now make the parent deal unavailable in shared order pricing, WhatsApp menu discovery and the public QR menu.
- Duplicate AI selections for the same dish and size are combined; totals above 20 require clarification.
- Staff replies accepted by Meta but not persisted are shown immediately as a temporary outgoing bubble. Invoice dates are formatted in Pakistan time and payment labels no longer say "Not selected" for unpaid orders.
- The reserved Restora OTP number is rejected by tenant signup and ignored by the restaurant webhook. Set `WHATSAPP_PLATFORM_PHONE_NUMBER_ID` explicitly on production; the legacy `WHATSAPP_PHONE_NUMBER_ID` is also treated as reserved.

## Infrastructure prerequisites
- Set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT` on the backend. Generate a stable VAPID key pair once with `bunx web-push generate-vapid-keys`. Changing the key pair invalidates existing browser subscriptions.
- `app.restora.live` must serve the PWA/service worker over HTTPS. Staff must opt in to browser notifications. The current browser control is shared by Restora's order, table-call and WhatsApp push alerts, and disabling it turns off all three.
- Configure `EXPO_ACCESS_TOKEN` where Expo requires enhanced push security. Validate native device handling of `screen: whatsapp`.
- Meta must approve/enable required onboarding permissions, Facebook Login for Business and the selected restaurant's number. Do not configure the Restora platform OTP number as a restaurant signup default.

## Acceptance tests on staging
1. Connect a restaurant-owned test number to branch A through Meta. Confirm it shows Connected or Registration required, with useful error guidance for failed codes and registration.
2. Send a text into branch A's WhatsApp number. Confirm it appears in the inbox within one refresh cycle, unread for each staff member who has not opened it.
3. Open it as staff member 1: only their unread indicator clears. Another member still sees it as unread. A staff member lacking `orders:view` receives neither the inbox nor a push.
4. Repeat the exact signed Meta webhook: no duplicate message, order or notification. Send a delivery status: it updates the outbound badge but does not create an inbound alert.
5. With Restora in the foreground, verify the in-app message toast. With the browser closed/backgrounded and notification permission granted, verify web push and tap-through to `/whatsapp`.
6. Turn off browser alerts and confirm they cease for the current browser. Explain that this also disables other Restora browser alerts. Re-enable and verify again.
7. Verify replies within the 24-hour customer-service window and a blocked reply after the window. A Meta-accepted reply not stored by Restora must not tempt staff to resend blindly.
8. Sign into restaurant B: ensure branch A's chats, unread markers, replies and push notifications cannot be viewed or acknowledged by B.
9. Verify failed / disconnected / expired number statuses and retry through Meta without leaking its authorization code or token.
10. Validate web responsive layout on mobile, keyboard search, inaccessible network states and browser notification permission denied.

The code and tests cannot establish real Meta approval, a live customer-number connection, native mobile deep-link behavior, or successful browser notification delivery without production environment credentials and live device checks.
