import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWorkspaceMonitor } from '../platforms/wechat/monitor/workspace-monitor.mjs';

/** Boundary: workspace identity, failure latching, restoration and child lifecycle without real OS or account access. */
const identity = { pid: 123, startedAt: '2026-10-30T08:00:00.1234567Z', accountId: 'wxid_synthetic_owner' };
const snapshot = (overrides = {}) => ({ instances: [{ ...identity, status: 'identified',
  account: { id: identity.accountId, verified: true }, ...overrides }] });
function fixture(scan = async () => snapshot(), options = {}) {
  const records = [];
  let saved = null;
  const logger = { record: async (type, details) => { records.push({ type, details }); return true; },
    recordSync(type, details) { records.push({ type, details }); },
    getStatus: () => ({ available: true, code: null }), dispose: async () => {} };
  const store = { read: async () => saved, write: async (selected, enabled) => { saved = { identity: selected, enabled }; } };
  const host = new EventEmitter();
  const monitor = createWorkspaceMonitor({ scan, logger, store, processRef: host, readCrashEvents: async () => [], ...options });
  return { monitor, records, store, host };
}
test('selecting binds exact creation timestamp and account; detached return values cannot mutate binding', async t => {
  const { monitor } = fixture();
  t.after(() => monitor.dispose());
  assert.equal(monitor.getState().canSend, false);
  const state = await monitor.select(identity);
  assert.equal(state.status, 'active');
  assert.equal(state.canSend, true);
  state.selected.accountId = 'wxid_other';
  assert.equal(monitor.getState().selected.accountId, identity.accountId);
});
test('a reused PID, account change and unverifiable account revoke work instead of switching sessions', async t => {
  for (const [overrides, code] of [
    [{ startedAt: '2026-10-30T08:00:00.1234568Z' }, 'WORKSPACE_PROCESS_REPLACED'],
    [{ account: { id: 'wxid_other', verified: true } }, 'WORKSPACE_ACCOUNT_CHANGED'],
    [{ status: 'unidentified', account: null }, 'WORKSPACE_ACCOUNT_UNVERIFIED'],
  ]) {
    let next = snapshot();
    const { monitor } = fixture(async () => next);
    t.after(() => monitor.dispose());
    await monitor.select(identity);
    next = snapshot(overrides);
    const state = await monitor.checkNow();
    assert.equal(state.status, 'interrupted');
    assert.equal(state.reason.code, code);
    assert.equal(state.canSend, false);
    next = snapshot();
    assert.equal((await monitor.checkNow()).canSend, false, 'a later matching scan cannot silently resume sending');
  }
});
test('process disappearance is recorded as missing, not an invented crash', async t => {
  let next = snapshot();
  const { monitor, records } = fixture(async () => next);
  t.after(() => monitor.dispose());
  await monitor.select(identity);
  next = { instances: [] };
  assert.equal((await monitor.checkNow()).reason.code, 'WORKSPACE_PROCESS_MISSING');
  assert.equal(records.at(-1).details.code, 'WORKSPACE_PROCESS_MISSING');
});
test('failed selection and a monitoring scan error leave sending disabled with logs', async t => {
  let failed = true;
  const { monitor, records } = fixture(async () => { if (failed) throw new Error('private error payload'); return snapshot(); });
  t.after(() => monitor.dispose());
  await assert.rejects(monitor.select(identity), { code: 'WORKSPACE_SCAN_FAILED' });
  assert.equal(monitor.getState().status, 'interrupted');
  failed = false;
  await monitor.select(identity);
  failed = true;
  assert.equal((await monitor.checkNow()).canSend, false);
  assert.equal(records.some(item => item.type === 'workspace.scan.failed'), true);
});
test('restore verifies the same session and does not reacquire a replacement process with the same account', async t => {
  const { monitor, store } = fixture(async () => snapshot({ pid: 456 }));
  t.after(() => monitor.dispose());
  await store.write(identity, true);
  const state = await monitor.restore();
  assert.equal(state.status, 'interrupted');
  assert.equal(state.reason.code, 'WORKSPACE_PROCESS_MISSING');
  assert.equal(state.canSend, false);
});
test('normal child completion is logged; unexpected native exit revokes the selected workspace', async t => {
  const { monitor, records, host } = fixture();
  t.after(() => monitor.dispose());
  await monitor.select(identity);
  const child = Object.assign(new EventEmitter(), { pid: 999 });
  const release = monitor.trackChild(child, 'send-text');
  child.emit('exit', 0, null);
  assert.equal(monitor.getState().canSend, true);
  child.emit('exit', 1, null);
  assert.equal(monitor.getState().canSend, false);
  assert.equal(records.some(item => item.type === 'child.exit' && item.details.exitCode === 1), true);
  host.emit('uncaughtExceptionMonitor', new TypeError('payload'), 'uncaughtException');
  assert.equal(records.some(item => item.type === 'host.uncaught'), true);
  release();
  assert.equal(child.listenerCount('error'), 0);
});
test('concurrent selections cannot race persisted bindings', async t => {
  let resolveScan;
  const { monitor } = fixture(() => new Promise(resolve => { resolveScan = resolve; }));
  t.after(() => monitor.dispose());
  const first = monitor.select(identity);
  await assert.rejects(monitor.select({ ...identity, pid: 456 }), { code: 'WORKSPACE_SELECTION_BUSY' });
  resolveScan(snapshot());
  assert.equal((await first).selected.pid, identity.pid);
});
test('an old native child cannot revoke a newly selected workspace', async t => {
  const { monitor } = fixture();
  t.after(() => monitor.dispose());
  await monitor.select(identity);
  const child = Object.assign(new EventEmitter(), { pid: 999 });
  monitor.trackChild(child);
  await monitor.select(identity);
  child.emit('exit', 1, null);
  assert.equal(monitor.getState().status, 'active');
});
test('interrupted work keeps collecting a later crash and deduplicates repeated system records', async t => {
  let next = snapshot();
  const crash = { eventId: 1000, code: '0xc0000005', time: '2026-10-30T08:10:26.000Z', faultModule: 'ntdll.dll' };
  const { monitor, records } = fixture(async () => next, { readCrashEvents: async () => [crash] });
  t.after(() => monitor.dispose());
  await monitor.select(identity);
  const child = Object.assign(new EventEmitter(), { pid: 999 });
  monitor.trackChild(child);
  child.emit('exit', 1, null);
  assert.equal(monitor.getState().canSend, false);
  next = { instances: [] };
  await monitor.checkNow();
  await monitor.checkNow();
  assert.equal(monitor.getState().reason.code, 'WORKSPACE_PROCESS_MISSING');
  assert.equal(records.filter(item => item.type === 'workspace.crash.event').length, 1);
  assert.equal(monitor.getState().canSend, false);
});
