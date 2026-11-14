# Restora Backend — QA and CI

## Before a local commit

Use Bun `1.4.3` from `.bun-version`. One-time setup:

```sh
bun install --frozen-lockfile
bun run qa:setup
```

The setup command configures this checkout's `core.hooksPath` to `.githooks`. It does not change Git's global configuration.

The pre-commit hook:
- Rejects tracked changes not included in the index and untracked files, so the tested working tree matches the commit.
- Runs `bun run qa:verify` for changes to `src/`, `tests/`, `shared/`, `site/`, `scripts/`, `package.json`, `bun.lock`, `index.ts`, `tsconfig.json`, `.bun-version`, GitHub workflows or the hook itself.
- Skips documentation-only commits.

`bun run qa:verify` runs **typecheck → WhatsApp safety lint → the existing full Bun test script → site build** in order. It stops at the first failure. Tests run with `NODE_ENV=test` and dummy SMTP variables so the test process never uses a real email account. Database tests use mongodb-memory-server; its binary may download on first use. No real restaurant, customer, or payment data should be used in tests.

The existing `bun run test` script explicitly enumerates its test files. When adding a new test file, update that script so it joins the commit gate and CI.

## GitHub Actions

- `.github/workflows/ci.yml` runs on pull requests, manually, and as the production/development deployment gate via `workflow_call`. It runs only the required pinned-Bun typecheck/lint/test job. Older runs on an updated PR are cancelled.
- `.github/workflows/dependency-health.yml` runs nonblocking dependency auditing and latest-Bun compatibility weekly or manually, not on every PR.
- `.github/workflows/platform-feature-checks.yml` is manual only, because the normal test suite already includes those focused tests.
- `.github/workflows/deploy.yml` deploys production after the reused CI gate. `.github/workflows/deploy-dev.yml` is manually dispatched and likewise runs CI first. Both deployment jobs check SSH settings before installing/building or uploading, and still require strict host-key verification.

## Deployment configuration

Set the production secrets `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS`, plus the repository/environment variable `DEPLOY_HOST`. The development workflow supports `DEV_DEPLOY_*` overrides. A missing value stops the deployment job early; never disable host-key checking or supply a guessed known-hosts value.

Use `ssh-keyscan` only to obtain candidate host-key material; verify the fingerprint against a trusted VPS control panel or console before adding `DEPLOY_KNOWN_HOSTS` to GitHub.

## Important limitation

Git hooks run on the developer's machine after `bun run qa:setup`; code changes made using GitHub's web UI or API do **not** execute a local hook. The PR CI remains the independent safety net, and main/development deployments continue to require their CI gate.
