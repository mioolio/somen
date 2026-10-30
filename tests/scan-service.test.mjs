import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanService } from '../platforms/wechat/server/scan-service.mjs';

/** Boundary: scan concurrency, expiry, cancellation, and failures; never touches real processes. */
test('parallel refreshes share one probe and cached data expires', async () => {
  let release, calls = 0, time = 1000;
  const service = createScanService({ now: () => time, probe: () => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  } });
  const first = service.scan(), second = service.scan();
  await Promise.resolve();
  assert.equal(calls, 1);
  release({ processes: [] });
  assert.deepEqual(await first, await second);
  assert.equal((await service.scan()).cached, true);
  time += 2100;
  const next = service.scan();
  await Promise.resolve();
  assert.equal(calls, 2);
  release({ processes: [] });
  assert.equal((await next).cached, false);
  service.dispose();
});
test('failed probes return errors, can retry, and never report a fabricated empty success', async () => {
  let calls = 0;
  const service = createScanService({ probe: async () => {
    if (++calls === 1) throw Object.assign(new Error('permission denied'), { code: 'PROBE_FAILED' });
    return { processes: [] };
  } });
  await assert.rejects(service.scan(), { code: 'PROBE_FAILED' });
  assert.equal((await service.scan()).instanceCount, 0);
  assert.equal(calls, 2);
  service.dispose();
});
test('disposing the plugin signals pending work and rejects future requests', async () => {
  let signal;
  const service = createScanService({ probe: async options => { signal = options.signal; return { processes: [] }; } });
  await service.scan();
  service.dispose();
  assert.equal(signal.aborted, true);
  await assert.rejects(service.scan(), { code: 'PLUGIN_STOPPED' });
});
