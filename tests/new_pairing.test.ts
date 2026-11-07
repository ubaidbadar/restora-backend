import { test } from 'node:test';
import assert from 'node:assert/strict';
import newPairing from '../src/utils/new_pairing.ts';

test('printer pairing codes are exactly six decimal digits, including leading zeros', () => {
  let leadingZero = false;
  const codes = new Set<string>();
  for (let i = 0; i < 2_500; i++) {
    const { code } = newPairing();
    assert.match(code, /^\\d{6}$/);
    leadingZero ||= code.startsWith('0');
    codes.add(code);
  }
  assert.equal(leadingZero, true);
  // Collisions are possible in a six-digit keyspace, but a broken constant generator is not.
  assert.ok(codes.size > 2_450, `only ${codes.size} distinct codes`);
});

test('printer pairing expiration is ten minutes from generation', () => {
  const before = Date.now();
  const pairing = newPairing();
  const after = Date.now();
  assert.ok(Number.isFinite(Date.parse(pairing.expiresAt)));
  assert.ok(Date.parse(pairing.expiresAt) >= before + 600_000);
  assert.ok(Date.parse(pairing.expiresAt) <= after + 600_000);
});

test('each call returns fresh code and expiry fields without leaking other data', () => {
  const pairing = newPairing();
  assert.deepEqual(Object.keys(pairing).sort(), ['code', 'expiresAt']);
});
