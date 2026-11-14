# Restora Backend

Bun/Hono API and restaurant platform services. Node tooling is not required for the backend test runner; install the version of Bun pinned in `.bun-version`.

## Test before you commit

On a new machine, after cloning:

```bash
bun install --frozen-lockfile
bun run qa:setup
```

This configures the version-controlled `.githooks/pre-commit` hook for your local checkout. Normal local commits containing source code, backend tests, shared types or build/workflow files will run TypeScript, lint, the full existing Bun test script and the site build **before the commit is created**. Failed tests block the commit. Incomplete staging and untracked files are also rejected to avoid testing a different tree than the one committed. Documentation-only commits are exempt.

You can run the same check yourself at any time:

```bash
bun run qa:verify
```

See [docs/QA.md](docs/QA.md) for CI, deployment safety and test environment details.
