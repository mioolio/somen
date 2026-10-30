import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createNativeRuntime } from '../native-runtime.mjs';

/** Boundary: regression contract for resident callback ownership; never attaches a real Weixin process. */
test('quiescing a runtime retains its independent worker and never sends a kill', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.connected = true;
  let unreferenced = false, channelUnreferenced = false, killed = false;
  child.unref = () => { unreferenced = true; };
  child.channel = { unref() { channelUnreferenced = true; } };
  child.kill = () => { killed = true; };
  child.send = (message, callback) => {
    callback?.();
    queueMicrotask(() => child.emit('message', { id: message.id, result: message.method === 'dispose'
      ? { disposed: false, retained: true, quiesced: true } : { ready: true } }));
  };
  const runtime = await createNativeRuntime({ binding: {}, forkImpl: () => child });
  assert.deepEqual(await runtime.dispose(), { disposed: false, retained: true, quiesced: true });
  assert.equal(unreferenced, true);
  assert.equal(channelUnreferenced, true);
  assert.equal(killed, false);
});
test('attached native session contains no proactive unload or detach path', async () => {
  const source = await readFile(new URL('../native-session.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.\s*(?:unload|detach)\s*\(/);
  assert.match(source, /retained-until-client-exit/);
});
