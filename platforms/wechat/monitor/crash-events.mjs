import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { correlateCrashRecords } from './crash-records.mjs';

/** Boundary: fixed read-only Windows Event Log query; returns no raw event XML, messages or machine paths. */
const execute = promisify(execFile);
const script = fileURLToPath(new URL('./crash-events.ps1', import.meta.url));
export async function readWindowsCrashEvents(binding, { run = execute, platform = process.platform, signal } = {}) {
  if (platform !== 'win32') return [];
  const { pid, startedAt, until = new Date().toISOString(), processName = 'Weixin.exe' } = binding || {};
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isFinite(Date.parse(startedAt))
    || !Number.isFinite(Date.parse(until)) || !['Weixin.exe', 'WeChat.exe'].includes(processName)) {
    throw Object.assign(new Error('崩溃事件查询身份无效。'), { code: 'CRASH_QUERY_IDENTITY_INVALID' });
  }
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout } = await run(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script,
      '-StartedAt', startedAt, '-Until', until, '-ApplicationName', processName],
    { encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 256 * 1024, signal });
    const records = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    return correlateCrashRecords(records, { pid, startedAt, until, processName });
  } catch (error) {
    throw Object.assign(new Error('Windows 崩溃事件暂不可读取。'), { code: 'CRASH_QUERY_FAILED', cause: error });
  }
}
