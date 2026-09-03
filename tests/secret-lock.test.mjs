import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyPassword} from '../secret-lock.mjs';

test('the retired password and empty input no longer unlock the gate', async () => {
  assert.equal(await verifyPassword('mudkip'), false);
  assert.equal(await verifyPassword(''), false);
  assert.equal(await verifyPassword(null), false);
});

// Supply the actual password through the local test environment, never commit it.
test('the configured password works and remains case-sensitive', {skip: !process.env.SECRET_TEST_PASSWORD}, async () => {
  const password = process.env.SECRET_TEST_PASSWORD;
  assert.equal(await verifyPassword(password), true);
  assert.equal(await verifyPassword(password.toLowerCase()), false);
  assert.equal(await verifyPassword(password + ' '), false);
  for (const path of ['../secret-lock.mjs','../secret.js','../secret.html']) {
    assert.ok(!fs.readFileSync(new URL(path,import.meta.url),'utf8').includes(password), 'Do not ship the cleartext password.');
  }
});
