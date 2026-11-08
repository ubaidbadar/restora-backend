# Restora platform administration — backend contract

## Design principles

- Admin authorization is independent of restaurant roles. No ordinary restaurant owner gains platform access.
- All endpoints live at `/api/v1/platform/*` and use their own `platformAdminGuard`.
- A verified Better Auth session is required on every request.
- Platform owners are granted by a **server-only** comma-separated `PLATFORM_ADMIN_BOOTSTRAP_EMAILS` allowlist. Default: none.
- Additional support/analyst access is granted/revoked only by platform owners, by verified Restora account email.
- Platform-team changes are written to `platform_audit_entries` (transactional when MongoDB supports it).
- Support/analyst APIs are read-only. Restaurant PII and Meta tokens are never returned in platform views.
- Platform origin restriction: `PLATFORM_ADMIN_ORIGINS` (exact HTTPS origins), and add the same origins to `CLIENT_ORIGIN` for credentialed CORS.

## API

- `GET /me`: platform role and email.
- `GET /overview`: aggregated restaurant/branch/order/customer/connected-number counts.
- `GET /restaurants?page=&q=`: paginated directory with bounded name search.
- `GET /restaurants/:id`: selected restaurant's branches, order statuses, WhatsApp connection health.
- `GET /health`: database connection and Meta configuration presence (not full uptime/latency health).
- `GET /team`, `PUT /team`: owner-only team management.
- `GET /activity`: owner-only team authorization history.

No customer passwords, session tokens, encrypted WhatsApp tokens, restaurant staff PINs or raw MongoDB collections are accessible.

## Verify

- Run `NODE_ENV=test bun test tests/platform_admin.test.ts`.
- Normal restaurant owner gets 403; unauthenticated/unverified user gets 401.
- A bootstrap owner can invite/revoke verified accounts. A support account cannot alter roles or view platform access history.
- Access from an unallowlisted Origin gets 403.
- Disabled members lose access immediately on the next request.
- No production deployment until the admin portal runs on an approved HTTPS same-site domain, tests pass, and audit policy/security review is complete.

## Future admin modules

- Billing, plan management, payment reconciliation — requires separate financial permissions, audit policy and payment-provider integration.
- Support cases, platform logs, usage metrics, incidents and SLA monitoring — require a dedicated telemetry pipeline.
- Restaurant data export/deletion support — requires authorized, audited workflows and customer/privacy policy review.

Do **not** implement impersonation or unrestricted database editors by default.
