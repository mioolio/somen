import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNativeRuntime } from '../native-runtime.mjs';

/** Boundary: synthetic IPC only; retirement fences business calls without killing any process or touching WeChat. */
function workerDouble(disposeReply) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.connected = true;
  const calls = [], effects = { killed: false, unref: false, channelUnref: false };
  child.unref = () => { effects.unref = true; };
  child.channel = { unref() { effects.channelUnref = true; } };
  child.kill = () => { effects.killed = true; };
  child.send = (message, callback) => {
    calls.push(message.method);
    if (message.method === 'dispose') { disposeReply?.({ child, message, callback }); return; }
    callback?.();
    queueMicrotask(() => child.emit('message', { id: message.id, result: { ready: true } }));
  };
  return { child, calls, effects };
}
test('dispose immediately fences business operations while its IPC reply is still pending', async () => {
  let release;
  const fixture = workerDouble(({ child, message, callback }) => {
    callback?.(); release = () => child.emit('message', { id: message.id, result: { disposed: false, retained: true } });
  });
  const runtime = await createNativeRuntime({ binding: {}, forkImpl: () => fixture.child });
  const first = runtime.dispose();
  assert.equal(runtime.dispose(), first, 'retirement is memoized instead of repeating native teardown requests');
  await assert.rejects(runtime.sendText({ requestId: 'fixture', content: 'fixture' }), { code: 'NATIVE_RUNTIME_BLOCKED' });
  await assert.rejects(runtime.contacts(), { code: 'NATIVE_RUNTIME_BLOCKED' });
  assert.equal((await runtime.status()).transportBlocked, true, 'status is still available for diagnostics');
  release();
  const result = await first;
  assert.equal(result.quiesced, true);
  assert.equal(result.retained, true, 'legacy retained-only responses are compatible');
  assert.equal(result.disposed, false);
  assert.equal(fixture.calls.filter(method => method === 'dispose').length, 1);
  assert.equal(fixture.effects.killed, false);
  assert.equal(fixture.effects.unref, true);
  assert.equal(fixture.effects.channelUnref, true);
});
test('IPC failure keeps the business fence in place and retains unknown native ownership', async () => {
  const fixture = workerDouble(({ callback }) => callback(Object.assign(new Error('fixture disconnected'), { code: 'ERR_IPC_CHANNEL_CLOSED' })));
  const runtime = await createNativeRuntime({ binding: {}, forkImpl: () => fixture.child });
  const first = runtime.dispose();
  const result = await first;
  assert.deepEqual(result, { disposed: false, retained: true, quiesced: true,
    remoteAcknowledged: false, code: 'NATIVE_IPC_FAILED' });
  assert.equal(runtime.dispose(), first);
  await assert.rejects(runtime.bindTarget({ id: 'fixture' }), { code: 'NATIVE_RUNTIME_BLOCKED' });
  assert.equal(fixture.effects.killed, false);
});
test('an unresponsive dispose times out as retained and never enables another send', async () => {
  const fixture = workerDouble(() => {});
  const runtime = await createNativeRuntime({ binding: {}, timeoutMs: 10, forkImpl: () => fixture.child });
  const result = await runtime.dispose();
  assert.equal(result.quiesced, true);
  assert.equal(result.retained, true);
  assert.equal(result.code, 'NATIVE_OPERATION_UNKNOWN');
  await assert.rejects(runtime.sendImage({ requestId: 'fixture', path: 'fixture' }), { code: 'NATIVE_RUNTIME_BLOCKED' });
  assert.equal(fixture.effects.killed, false);
});
test('a worker exit without target termination is not a native release proof', async () => {
  const fixture = workerDouble(() => {});
  const runtime = await createNativeRuntime({ binding: {}, forkImpl: () => fixture.child });
  fixture.child.connected = false;
  fixture.child.emit('exit', 1, null);
  const result = await runtime.dispose();
  assert.equal(result.retained, true);
  assert.equal(result.disposed, false);
  assert.equal(fixture.effects.killed, false);
});
