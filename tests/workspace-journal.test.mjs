import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createSendJournal } from '../platforms/wechat/server/send-journal.mjs';

/** Boundary: durable deduplication and disk-failure tests use a disposable ledger with synthetic identities only. */
const scope = { pid: 32100, startedAt: '2026-10-30T01:00:00Z', accountId: 'fixture_self', target: 'fixture_target' };
const request = id => ({ requestId: id, kind: 'text', scope, payload: 'fixture private body' });
async function directoryFor(t) {
  const directory = await mkdtemp(join(tmpdir(), 'somen-workspace-ledger-'));
  t.after(async () => { assert.equal(resolve(dirname(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); });
  return directory;
}
test('an unfinished reservation survives restart and does not store raw message or account data', async t => {
  const directory = await directoryFor(t);
  const first = createSendJournal({ directory });
  assert.equal((await first.reserve(request('fixture-unknown'))).fresh, true);
  const restored = createSendJournal({ directory });
  const repeated = await restored.reserve(request('fixture-unknown'));
  assert.equal(repeated.fresh, false); assert.equal(repeated.record.status, 'unknown');
  const disk = await readFile(join(directory, 'send-journal.json'), 'utf8');
  for (const sensitive of ['fixture private body', 'fixture_self', 'fixture_target']) assert.equal(disk.includes(sensitive), false);
});
test('an unreadable durable ledger fails closed even after earlier successful reservations', async t => {
  const directory = await directoryFor(t);
  const journal = createSendJournal({ directory });
  await journal.reserve(request('fixture-initial'));
  const file = join(directory, 'send-journal.json');
  await unlink(file); await mkdir(file);
  await assert.rejects(journal.reserve(request('fixture-write-failed')), { code: 'JOURNAL_UNAVAILABLE' });
  await assert.rejects(journal.reserve(request('fixture-write-failed')), { code: 'JOURNAL_UNAVAILABLE' });
});
test('independent journal owners cannot both reserve the same request as fresh', async t => {
  const directory = await directoryFor(t);
  const first = createSendJournal({ directory }), second = createSendJournal({ directory });
  const results = await Promise.all([first.reserve(request('fixture-concurrent')), second.reserve(request('fixture-concurrent'))]);
  assert.equal(results.filter(result => result.fresh).length, 1);
});
