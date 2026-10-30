import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowLocalRequest } from '../kernel/http/local-access.mjs';

/** Boundary: local account API access must reject foreign Host/Origin and cross-site reads. */
test('same-origin loopback access works and foreign origins are rejected', () => {
  const response = { writeHead() {}, end() {} };
  const allow = headers => allowLocalRequest({ headers }, response, 5173);
  assert.equal(allow({ host: '127.0.0.1:5173' }), true);
  assert.equal(allow({ host: 'localhost:5173', origin: 'http://localhost:5173' }), true);
  assert.equal(allow({ host: 'attacker.test:5173' }), false);
  assert.equal(allow({ host: '127.0.0.1:5173', origin: 'https://attacker.test' }), false);
  assert.equal(allow({ host: '127.0.0.1:5173', 'sec-fetch-site': 'cross-site' }), false);
  assert.equal(allow({ host: '127.0.0.1:5173', origin: 'null' }), false);
});
