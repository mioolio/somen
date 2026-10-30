import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createWorkspaceService } from '../platforms/wechat/server/workspace-service.mjs';

/** Boundary: workspace authorization and lifecycle tests use only synthetic scans and native doubles, never Weixin. */
const identity = { pid: 32100, startedAt: '2026-10-30T01:00:00.1234567Z' };
const self = 'wxid_fixture_self';
const contact = id => ({ id, displayName: `fixture-${id}` });
const current = { ...identity, role: 'main', status: 'identified', account: { id: self, verified: true }, version: '4.2.0.7', executablePath: 'C:\\fixture\\Weixin.exe', processName: 'Weixin.exe' };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'somen-workspace-service-'));
  const calls = { created: 0, sent: [], contacts: 0, disposed: 0, events: [], scans: 0 };
  let target = null;
  let rows = [contact('fixture_alice')];
  let instance = current;
  const failingTargets = new Set();
  const runtime = {
    async contacts() { calls.contacts++; return { contacts: rows, complete: false }; },
    async bindTarget(value) { if (failingTargets.has(value.id)) throw new Error('fixture bind failed'); target = value; return { bound: true, capabilities: { text: true, image: true } }; },
    async sendText(input) { calls.sent.push({ target: target?.id, input }); return { status: 'accepted', deliveryConfirmed: true }; },
    async sendImage(input) { calls.sent.push({ target: target?.id, input }); return { status: 'accepted', deliveryConfirmed: true }; },
    async dispose() { calls.disposed++; return { disposed: true }; },
  };
  const service = createWorkspaceService({ directory, scan: async () => { calls.scans++; return { instances: [{ ...instance }] }; },
    runtimeFactory: async input => { calls.created++; calls.events.push(input.onEvent); return options.factory ? options.factory(input, runtime) : runtime; } });
  t.after(async () => {
    await service.dispose();
    // The generated disposable directory must remain directly under the intended temp root.
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return { service, directory, calls, runtime, rows: value => { rows = value; }, instance: value => { instance = value; }, failingTargets };
}
test('only the sole personal contact can become a send target', async t => {
  const { service, calls, rows } = await fixture(t);
  await service.select(identity);
  await assert.rejects(service.sendText({ requestId: 'fixture-no-target', content: 'fixture' }), { outcome: 'not-sent' });
  rows([contact('fixture_alice'), contact('fixture_bob')]);
  await service.readContacts();
  assert.equal(service.getState().target, null);
  await assert.rejects(service.bindTarget({ contactId: 'fixture_alice' }), { code: 'CONTACT_SCOPE' });
  assert.equal(calls.sent.length, 0);
});
test('a repeated request id cannot submit native text twice or change its content', async t => {
  const { service, calls } = await fixture(t);
  await service.select(identity); await service.readContacts();
  const request = { requestId: 'fixture-once', content: 'fixture' };
  assert.equal((await service.sendText(request)).status, 'sent');
  assert.equal((await service.sendText(request)).status, 'sent');
  await assert.rejects(service.sendText({ ...request, content: 'different' }), { code: 'REQUEST_ID_CONFLICT' });
  assert.equal(calls.sent.length, 1);
});

test('each new send performs one fresh identity check immediately before native submission', async t => {
  const { service, calls, instance } = await fixture(t);
  await service.select(identity); await service.readContacts();
  const before = calls.scans;
  await service.sendText({ requestId: 'fixture-one-fresh-scan', content: 'fixture' });
  assert.equal(calls.scans - before, 1);
  assert.equal(calls.sent.length, 1);
  instance({ ...current, startedAt: '2026-10-30T02:00:00.1234567Z' });
  await assert.rejects(service.sendText({ requestId: 'fixture-reused-pid', content: 'fixture' }), { outcome: 'not-sent' });
  assert.equal(calls.sent.length, 1);
});
test('a failed target replacement cannot expose a ready recipient or send to the old one', async t => {
  const { service, calls, rows, failingTargets } = await fixture(t);
  await service.select(identity); await service.readContacts();
  rows([contact('fixture_bob')]); failingTargets.add('fixture_bob');
  await assert.rejects(service.readContacts(), /fixture bind failed/);
  assert.equal(service.getState().target, null);
  assert.equal(service.getState().capabilities.text, false);
  await assert.rejects(service.sendText({ requestId: 'fixture-after-bind-failure', content: 'fixture' }));
  assert.equal(calls.sent.length, 0);
});
test('events from a disposed runtime cannot revoke a replacement workspace', async t => {
  const { service, calls, instance } = await fixture(t);
  await service.select(identity); await service.readContacts();
  const previousEvent = calls.events[0];
  instance({ ...current, pid: current.pid + 1 });
  await service.select({ ...identity, pid: identity.pid + 1 }); await service.readContacts();
  previousEvent({ type: 'native.worker-exit', code: 0 });
  assert.equal(service.getState().capabilities.text, true);
});
for (const cleanup of ['legacy-retained', 'failed', 'rejected', 'unresponsive']) {
  test(`selection succeeds while previous native cleanup is ${cleanup}`, { timeout: 3000 }, async t => {
    const { service, runtime, instance, calls } = await fixture(t);
    await service.select(identity); await service.readContacts();
    const previousEvent = calls.events[0];
    runtime.dispose = () => {
      if (cleanup === 'failed') throw Object.assign(new Error('fixture cleanup failure'), { code: 'FIXTURE_IPC_FAILED' });
      if (cleanup === 'rejected') return Promise.reject(Object.assign(new Error('fixture cleanup rejection'), { code: 'FIXTURE_IPC_FAILED' }));
      return cleanup === 'unresponsive' ? new Promise(() => {}) : Promise.resolve({ retained: true });
    };
    instance({ ...current, pid: current.pid + 1 });
    const next = await service.select({ ...identity, pid: identity.pid + 1 });
    assert.equal(next.binding.pid, identity.pid + 1);
    assert.equal(next.status, 'active');
    assert.equal(next.target, null);
    assert.deepEqual(next.contacts, []);
    assert.equal(next.capabilities.text, false);
    assert.equal(next.diagnostics.retainedRuntimeCount, 1);
    previousEvent({ type: 'native.worker-exit', code: 1 });
    assert.equal(service.getState().status, 'active');
    await assert.rejects(service.sendText({ requestId: 'fixture-after-switch', content: 'fixture' }));
    assert.equal(calls.sent.length, 0);
  });
}
test('selecting the same active instance is idempotent and keeps its work context', async t => {
  const { service, calls } = await fixture(t);
  await service.select(identity); await service.readContacts();
  const previous = service.getState();
  const selected = await service.select(identity);
  assert.deepEqual(selected.target, previous.target);
  assert.equal(selected.capabilities.text, true);
  assert.equal(calls.created, 1);
  assert.equal(calls.disposed, 0);
});

test('reselecting the same binding permits navigation without clearing an unknown send outcome', async t => {
  const { service, calls, runtime } = await fixture(t);
  await service.select(identity); await service.readContacts();
  runtime.sendText = async input => { calls.sent.push(input); return { status: 'unknown' }; };
  await service.sendText({ requestId: 'fixture-unknown-once', content: 'fixture' });
  const previous = service.getState();
  const selected = await service.select(identity);
  assert.equal(selected.status, 'error');
  assert.deepEqual(selected.lastReceipt, previous.lastReceipt);
  assert.deepEqual(selected.target, previous.target);
  assert.equal(selected.capabilities.text, false);
  assert.equal(calls.created, 1);
  assert.equal(calls.disposed, 0);
  await assert.rejects(service.sendText({ requestId: 'fixture-unknown-again', content: 'fixture' }), { code: 'SEND_OUTCOME_UNKNOWN' });
  assert.equal(calls.sent.length, 1);
});

test('switching away and back cannot clear an unknown result for that exact binding', async t => {
  const { service, calls, runtime, instance } = await fixture(t);
  await service.select(identity); await service.readContacts();
  runtime.sendText = async input => { calls.sent.push(input); return { status: 'unknown' }; };
  await service.sendText({ requestId: 'fixture-unknown-before-switch', content: 'fixture' });
  const previous = service.getState().lastReceipt;
  instance({ ...current, pid: current.pid + 1 });
  assert.equal((await service.select({ ...identity, pid: identity.pid + 1 })).status, 'active');
  instance(current);
  const selected = await service.select(identity);
  assert.equal(selected.binding.pid, identity.pid);
  assert.equal(selected.status, 'error');
  assert.deepEqual(selected.lastReceipt, previous);
  assert.equal(selected.target, null);
  await assert.rejects(service.readContacts(), { code: 'SEND_OUTCOME_UNKNOWN' });
  await assert.rejects(service.sendText({ requestId: 'fixture-unknown-after-switch', content: 'fixture' }), { code: 'SEND_OUTCOME_UNKNOWN' });
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.created, 1);
});

test('reselecting a verified existing binding restores monitoring without replacing its native context', async t => {
  const { service, calls, instance } = await fixture(t);
  await service.select(identity); await service.readContacts();
  instance({ ...current, account: { ...current.account, verified: false } });
  await assert.rejects(service.sendText({ requestId: 'fixture-identity-paused', content: 'fixture' }));
  assert.equal(service.getState().status, 'lost');
  instance(current);
  const selected = await service.select(identity);
  assert.equal(selected.status, 'active');
  assert.equal(selected.capabilities.text, true);
  assert.equal(calls.created, 1);
  assert.equal(calls.disposed, 0);
  assert.equal(calls.sent.length, 0);
});
test('a quiesced native owner stays retained while selecting a different work instance', async t => {
  const { service, calls, runtime, instance } = await fixture(t);
  await service.select(identity); await service.readContacts();
  const previousEvent = calls.events[0];
  runtime.dispose = async () => ({ disposed: false, retained: true, quiesced: true });
  instance({ ...current, pid: current.pid + 1 });
  const next = await service.select({ ...identity, pid: identity.pid + 1 });
  assert.equal(next.binding.pid, identity.pid + 1);
  assert.equal(next.target, null);
  assert.equal(next.capabilities.text, false);
  assert.equal(next.diagnostics.retainedRuntimeCount, 1);
  await service.readContacts();
  previousEvent({ type: 'native.detached' });
  assert.equal(service.getState().status, 'active');
  assert.equal(service.getState().capabilities.text, true);
});
test('shutdown during asynchronous runtime creation releases the late runtime without reading contacts', async t => {
  let finishFactory, started;
  const factoryStarted = new Promise(resolve => { started = resolve; });
  const { service, calls } = await fixture(t, { factory: (_input, runtime) => {
    started(); return new Promise(resolve => { finishFactory = () => resolve(runtime); });
  } });
  await service.select(identity);
  const pending = service.readContacts();
  await factoryStarted;
  await service.dispose();
  finishFactory();
  await assert.rejects(pending);
  assert.equal(calls.contacts, 0);
  assert.equal(calls.disposed, 1);
});
test('restoring monitoring never restores a sending target or attaches a native runtime', async t => {
  const { service, directory } = await fixture(t);
  await service.select(identity); await service.readContacts(); await service.dispose();
  let attachments = 0;
  const restored = createWorkspaceService({ directory, scan: async () => ({ instances: [{ ...current }] }),
    runtimeFactory: async () => { attachments++; throw new Error('must not attach'); } });
  t.after(() => restored.dispose());
  await restored.restore();
  assert.equal(restored.getState().status, 'active');
  assert.equal(restored.getState().target, null);
  assert.deepEqual(restored.getState().contacts, []);
  assert.equal(restored.getState().capabilities.text, false);
  assert.equal(attachments, 0);
});
