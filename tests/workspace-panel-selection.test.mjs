import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkInstance, isCurrentWorkInstance } from '../platforms/wechat/panel/api/platform-selection.js';

/** Boundary: synthetic HTTP selection tests separate chosen identity from native readiness; no actual service or Weixin access. */
const instance = { pid: 32100, startedAt: '2026-10-30T01:00:00.1234567Z', role: 'main', status: 'identified', account: { id: 'wxid_fixture_self', verified: true } };
const binding = { pid: instance.pid, startedAt: instance.startedAt, accountId: instance.account.id };

test('reselecting an exact active, error or lost binding submits intent once and preserves returned unknown-send controls', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const status of ['active', 'error', 'lost']) {
    const state = { binding, status, lastReceipt: { requestId: 'fixture-unknown', status: 'unknown' }, capabilities: { text: false, image: false }, reason: { code: 'SEND_OUTCOME_UNKNOWN' } };
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, method: options.method, body: JSON.parse(options.body) });
      return Response.json(state);
    };
    const result = await selectWorkInstance(instance);
    assert.deepEqual(calls, [{ url: '/api/wechat/workspace/select', method: 'POST', body: { pid: instance.pid, startedAt: instance.startedAt } }]);
    assert.equal(result.status, status);
    assert.equal(result.lastReceipt.status, 'unknown');
    assert.deepEqual(result.capabilities, { text: false, image: false });
    assert.equal(isCurrentWorkInstance(result, instance), true);
  }
  assert.equal(isCurrentWorkInstance(null, null), false);
});

test('a newly selected exact binding succeeds even while native retirement leaves the work status in error', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    return Response.json({ binding, status: 'error', capabilities: { text: false }, reason: { code: 'NATIVE_RETAINED' } });
  };
  const result = await selectWorkInstance(instance);
  assert.equal(result.status, 'error');
  assert.deepEqual(calls.map(call => call.method), ['POST']);
  assert.equal(calls[0].url, '/api/wechat/workspace/select');
  assert.deepEqual(JSON.parse(calls[0].body), { pid: instance.pid, startedAt: instance.startedAt });
  assert.equal(result.capabilities.text, false);
});

test('selection still rejects a response bound to another PID, creation time, or account', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const wrong of [{ ...binding, pid: binding.pid + 1 }, { ...binding, startedAt: '2026-10-30T02:00:00Z' }, { ...binding, accountId: 'wxid_fixture_other' }]) {
    const calls = [];
    globalThis.fetch = async (_url, options) => {
      calls.push(options.method);
      return Response.json({ binding: wrong, status: 'active' });
    };
    await assert.rejects(selectWorkInstance(instance), /工作实例尚未确认/);
    assert.deepEqual(calls, ['POST']);
  }
});
