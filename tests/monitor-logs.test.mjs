import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createEventLog } from '../platforms/wechat/monitor/event-log.mjs';
import { createWorkspaceStore } from '../platforms/wechat/monitor/workspace-store.mjs';

/** Boundary: diagnostic privacy, bounded retention, local selection persistence and graceful disk failures. */
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'somen-monitor-'));
  assert.equal(resolve(directory).startsWith(resolve(tmpdir())), true);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('logs rotate within a fixed file count and never serialize content, account IDs or raw error messages', async t => {
  const directory = await temporary(t);
  const logger = createEventLog({ directory, maxBytes: 256, maxFiles: 3 });
  const sensitive = 'wxid_synthetic_private';
  for (let index = 0; index < 14; index++) {
    await logger.record('send.failed', { pid: 123, attempt: index, accountId: sensitive, message: sensitive,
      error: Object.assign(new Error(sensitive), { code: 'NATIVE_FAILURE' }) });
  }
  logger.recordSync('host.exit', { exitCode: 1 });
  await logger.dispose();
  const files = await readdir(directory);
  assert.ok(files.length <= 3);
  const contents = await Promise.all(files.map(file => readFile(join(directory, file), 'utf8')));
  assert.equal(contents.join('').includes(sensitive), false);
  assert.equal(contents.join('').includes('NATIVE_FAILURE'), true);
  for (const text of contents) for (const line of text.trim().split('\n')) assert.doesNotThrow(() => JSON.parse(line));
});
test('unwritable logging reports health without throwing out of the host', async t => {
  const directory = await temporary(t);
  const blocked = join(directory, 'blocked');
  await writeFile(blocked, 'not a directory');
  const logger = createEventLog({ directory: blocked });
  assert.equal(await logger.record('host.started'), false);
  assert.equal(logger.getStatus().available, false);
  await logger.dispose();
});
test('workspace persistence saves only an explicit selection and preserves stopped intent', async t => {
  const directory = await temporary(t);
  const store = createWorkspaceStore({ directory });
  const identity = { pid: 123, startedAt: '2026-10-30T08:00:00.1234567Z', accountId: 'wxid_synthetic_owner' };
  assert.equal(await store.read(), null);
  await store.write(identity, true);
  assert.deepEqual(await store.read(), { identity, enabled: true });
  await store.write(identity, false);
  assert.equal((await store.read()).enabled, false);
  assert.equal((await readdir(directory)).length, 1);
});
