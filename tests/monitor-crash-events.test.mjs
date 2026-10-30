import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlateCrashRecords } from '../platforms/wechat/monitor/crash-records.mjs';
import { readWindowsCrashEvents } from '../platforms/wechat/monitor/crash-events.mjs';

/** Boundary: crash attribution must distinguish two clients and remove raw event fields before diagnostics leave the reader. */
const binding = { pid: 123, processName: 'Weixin.exe', startedAt: '2026-10-30T08:00:00.1234567Z', until: '2026-10-30T09:00:00.000Z' };
const reportId = '12345678-1234-1234-1234-123456789abc';
const event = overrides => ({ eventId: 1000, application: 'Weixin.exe', pid: '0x7b', time: '2026-10-30T08:05:00.000Z',
  processStartedAt: binding.startedAt, code: 'c0000005', faultModule: 'Weixin.dll', reportId,
  message: 'private details', path: 'C:\\private\\Weixin.exe', ...overrides });
test('only the selected process lifetime and its correlated WER report are attributed', () => {
  const records = correlateCrashRecords([
    event(), event({ pid: '456' }), event({ processStartedAt: '2026-10-30T08:00:00.1234568Z' }),
    event({ application: 'WeChat.exe' }), event({ time: '2026-10-30T07:59:59.000Z' }),
    event({ eventId: 1001, pid: '', processStartedAt: null }),
    event({ eventId: 1001, pid: '', processStartedAt: null, reportId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
  ], binding);
  assert.deepEqual(records.map(record => record.eventId), [1000, 1001]);
  assert.deepEqual(Object.keys(records[0]).sort(), ['code', 'eventId', 'faultModule', 'time']);
  assert.equal(records[0].code, '0xc0000005');
});
test('a same-application WER record without PID or linked report does not prove this client crashed', () => {
  assert.deepEqual(correlateCrashRecords([event({ eventId: 1001, pid: '', processStartedAt: null })], binding), []);
});
test('untrusted module names and exception values do not escape the diagnostic allowlist', () => {
  const [record] = correlateCrashRecords([event({ faultModule: 'C:\\private\\bad.dll', code: 'private account content' })], binding);
  assert.equal(record.faultModule, null);
  assert.equal(record.code, null);
});
test('the Windows reader invokes a fixed bounded script and safely handles unavailable logs', async () => {
  let invocation;
  const records = await readWindowsCrashEvents(binding, { platform: 'win32', run: async (...args) => {
    invocation = args;
    return { stdout: JSON.stringify([event()]) };
  } });
  assert.equal(records.length, 1);
  assert.equal(invocation[0].toLowerCase().endsWith('windowspowershell\\v1.0\\powershell.exe'), true);
  assert.equal(invocation[2].windowsHide, true);
  assert.equal(invocation[2].timeout, 8000);
  await assert.rejects(readWindowsCrashEvents(binding, { platform: 'win32', run: async () => { throw new Error('machine path'); } }), { code: 'CRASH_QUERY_FAILED' });
});
