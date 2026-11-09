# WhatsApp production deployment checks

The authenticated WhatsApp Settings endpoints are implemented in
`src/routes/whatsapp_inbox.ts` and mounted under `/api/v1/whatsapp` in
`index.ts`. After deploying the backend, verify the public routing independently
of Meta app credentials or restaurant data.

```bash
for path in signup/config connections; do
  curl --silent --show-error --output /dev/null --write-out "%{http_code}\n" \
    "https://restora.live/api/v1/whatsapp/$path"
done
```

Expected result for each **unauthenticated** GET is `401` (sign-in required),
not `404` (route is missing). This check does not establish that Meta
Embedded Signup is configured or that a restaurant connection exists.

If either response is `404`:

1. Check the latest **Deploy to production** GitHub Actions run, including
   CI, the VPS atomic deployment, and the public WhatsApp route smoke test.
2. Verify that the active release at `/srv/restora/api/current` contains the
   `api.route('/whatsapp', whatsappInboxRouter)` mount in `index.ts`.
3. Verify that reverse proxy routing sends `/api/v1/*` to the active
   backend, not to Firebase Hosting or an older application process.

Do not expose WhatsApp access tokens, Meta app secrets, authorization codes,
or the AES token-encryption key while troubleshooting.

Authenticated acceptance is separate: verify the signed-in restaurant
owner's `devices:manage` permission, its current branch selection,
`signup/config` returned public IDs, and the tenant-scoped connections list.
Do not infer configuration readiness from an unauthenticated status check.
