import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createScannerBridge } from '../platforms/wechat/server/scanner-bridge.mjs';

/** Boundary: synthetic private scanner streams; no Windows APIs or native owners participate in these transport tests. */
function fixture(reply) {
  const children = [], writes = [];
  const bridge = createScannerBridge({ timeoutMs: 50, spawnImpl(executable, args, options) {
    assert.match(executable, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
    assert.match(args.at(-1), /scan-worker\.ps1$/);
    assert.equal(options.windowsHide, true);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.unref = () => {};
    child.kill = () => { child.killed = true; child.emit('exit', 0); };
    child.stdin.write = (command, encoding, callback) => {
      writes.push(command); callback?.();
      queueMicrotask(() => reply?.(child, writes.length));
    };
    children.push(child);
    return child;
  } });
  return { bridge, children, writes };
}
const respond = (child, number) => child.stdout.emit('data', `${JSON.stringify({ ok: true, snapshot: { processes: [{ pid: number }], warnings: [] } })}\n`);

test('fresh sequential snapshots reuse one scanner and only send the fixed command', async t => {
  const { bridge, children, writes } = fixture(respond);
  t.after(() => bridge.close());
  const [first, second] = await Promise.all([bridge.scan(), bridge.scan()]);
  assert.equal(first.processes[0].pid, 1);
  assert.equal(second.processes[0].pid, 2);
  assert.equal(children.length, 1);
  assert.deepEqual(writes, ['scan\n', 'scan\n']);
});

test('an invalid or failed snapshot rejects instead of reporting an empty scan and the next call reconnects', async t => {
  for (const payload of ['not json\n', '{"ok":true,"snapshot":{}}\n', '{"ok":false,"code":"PROCESS_QUERY_FAILED"}\n']) {
    const { bridge, children } = fixture((child, number) => number === 1 ? child.stdout.emit('data', payload) : respond(child, number));
    t.after(() => bridge.close());
    await assert.rejects(bridge.scan());
    assert.equal(children[0].killed, true);
    assert.equal((await bridge.scan()).processes[0].pid, 2);
    assert.equal(children.length, 2);
  }
});

test('abort and timeout terminate only the private read-only scanner', async t => {
  const { bridge, children } = fixture();
  t.after(() => bridge.close());
  const controller = new AbortController();
  const pending = bridge.scan({ signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, { code: 'SCAN_CANCELLED' });
  assert.equal(children[0].killed, true);
  await assert.rejects(bridge.scan(), { code: 'SCAN_TIMEOUT' });
  assert.equal(children[1].killed, true);
});

test('a request cancelled while queued never crosses the private input pipe', async t => {
  const { bridge, children, writes } = fixture();
  t.after(() => bridge.close());
  const first = bridge.scan();
  const controller = new AbortController();
  const second = bridge.scan({ signal: controller.signal });
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  respond(children[0], 1);
  await first;
  await assert.rejects(second, { code: 'SCAN_CANCELLED' });
  assert.deepEqual(writes, ['scan\n']);
});
