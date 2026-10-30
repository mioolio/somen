import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRouter } from '../kernel/http/router.mjs';

/** Boundary: real HTTP responses remain valid for malformed plugin output and arbitrary thrown values. */
test('invalid payloads and thrown null produce valid 503 responses', async t => {
  const router = createRouter();
  const namespace = router.namespace('/api/test');
  namespace.get('/null', () => { throw null; });
  namespace.get('/bigint', () => ({ value: 1n }));
  namespace.get('/cycle', () => { const cycle = {}; cycle.self = cycle; return cycle; });
  const server = createServer((request, response) => router.dispatch(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); server.closeAllConnections(); });
  for (const path of ['null', 'bigint', 'cycle']) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/test/${path}`);
    assert.equal(response.status, 503);
    assert.equal(typeof (await response.json()).error.message, 'string');
  }
});
test('released namespaces reject delayed registrations and path escapes', () => {
  const router = createRouter();
  const namespace = router.namespace('/api/test');
  assert.throws(() => namespace.get('/../foreign', () => ({})));
  namespace.dispose();
  assert.throws(() => namespace.get('/late', () => ({})), /已释放/);
});
