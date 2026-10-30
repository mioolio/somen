import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createRouter } from '../kernel/http/router.mjs';

/** Boundary: real HTTP body limits and transport errors must return controlled responses without touching Weixin. */
async function serverFor(t) {
  const router = createRouter();
  router.namespace('/fixture').post('/body', async ({ readJson }) => readJson({ maxBytes: 32 }));
  const server = createServer((request, response) => router.dispatch(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); server.closeAllConnections(); });
  return `http://127.0.0.1:${server.address().port}/fixture/body`;
}
test('valid JSON and explicit transport validation return HTTP responses', async t => {
  const url = await serverFor(t);
  const valid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"value":1}' });
  assert.equal(valid.status, 200); assert.deepEqual(await valid.json(), { value: 1 });
  const wrongType = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(wrongType.status, 415);
  const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});
test('a declared oversized JSON body returns 413', async t => {
  const url = await serverFor(t);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(64) }) });
  assert.equal(response.status, 413);
});
test('an oversized chunked JSON body returns 413 instead of dropping the response socket', async t => {
  const url = await serverFor(t);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: Readable.from(['{"value":"', 'x'.repeat(64), '"}']), duplex: 'half', signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'BODY_TOO_LARGE');
});
test('invalid UTF-8 bytes cannot silently become a different valid message', async t => {
  const url = await serverFor(t);
  const bytes = Buffer.from([123,34,120,34,58,34,255,34,125]);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bytes });
  assert.equal(response.status, 400);
});
