import { spawnSync } from 'node:child_process';

for (const check of ['typecheck', 'lint', 'test', 'build']) {
  console.log(`\nQA: bun run ${check}`);
  const env = check === 'test'
    ? {
        ...process.env,
        NODE_ENV: 'test',
        SMTP_HOST: 'smtp.ci.invalid',
        SMTP_USER: 'ci@example.invalid',
        SMTP_PASS: 'qa-test-only',
      }
    : process.env;
  const result = spawnSync('bun', ['run', check], {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
