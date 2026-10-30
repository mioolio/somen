import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot } from '../platforms/wechat/server/normalize-snapshot.mjs';

/** Boundary: protect user-visible counts and account evidence against multi-process and stale-data mistakes. */
const main = (pid, extra = {}) => ({ pid, parentPid: 1, role: 'main', processName: 'Weixin', accounts: [], ...extra });
const verified = id => ({ id, source: 'verified-current-owner', evidence: 'synthetic fixture', verified: true });
test('five processes belonging to one account are one instance, not five accounts', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100, { accounts: [verified('wxid_test_a')] }),
    ...[101, 102, 103, 104].map(pid => ({ pid, parentPid: 100, role: 'auxiliary', accounts: [verified('wxid_stale')] })),
  ] });
  assert.equal(snapshot.processCount, 5);
  assert.equal(snapshot.instanceCount, 1);
  assert.equal(snapshot.identifiedCount, 1);
  assert.equal(snapshot.instances[0].account.id, 'wxid_test_a');
  assert.equal(snapshot.instances[0].processIds.length, 5);
});
test('two main processes keep independent account identities even when one started the other', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100, { accounts: [verified('wxid_test_a')] }),
    main(200, { parentPid: 100, accounts: [verified('wxid_test_b')] }),
    { pid: 201, parentPid: 200, role: 'auxiliary' },
  ] });
  assert.equal(snapshot.instanceCount, 2);
  assert.deepEqual(snapshot.instances.map(item => item.account.id), ['wxid_test_a', 'wxid_test_b']);
});
test('historical directory candidates and multiple verified identities never become a guessed account', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100, { accounts: [{ id: 'wxid_old_suffix', verified: false, source: 'active-file-handle' }] }),
    main(200, { accounts: [verified('wxid_test_a'), verified('wxid_test_b')] }),
  ] });
  assert.equal(snapshot.identifiedCount, 0);
  assert.equal(snapshot.instances[0].status, 'unidentified');
  assert.equal(snapshot.instances[0].account, null);
  assert.equal(snapshot.instances[1].status, 'ambiguous');
});
test('unknown roles and orphaned auxiliary processes remain visible with diagnostics', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100), { pid: 200, parentPid: 999, role: 'auxiliary' }, { pid: 300, parentPid: 100, role: 'unknown' },
  ] });
  assert.equal(snapshot.processCount, 3);
  assert.equal(snapshot.instances.length, 3);
  assert.equal(snapshot.warnings.filter(item => item.code === 'PROCESS_ROLE_UNCERTAIN').length, 2);
});
test('a reused parent PID cannot absorb a process created before it', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100, { startedAt: '2026-10-30T02:00:00Z' }),
    { pid: 200, parentPid: 100, role: 'auxiliary', startedAt: '2026-10-30T01:00:00Z' },
  ] });
  assert.equal(snapshot.instanceCount, 2);
});
test('different installations are not grouped and unconfirmed processes do not inflate confirmed count', () => {
  const snapshot = normalizeSnapshot({ processes: [
    main(100, { executablePath: 'C:\\first\\Weixin.exe' }),
    { pid: 200, parentPid: 100, role: 'auxiliary', executablePath: 'C:\\second\\Weixin.exe' },
  ] });
  assert.equal(snapshot.instanceCount, 2);
  assert.equal(snapshot.confirmedInstanceCount, 1);
});
