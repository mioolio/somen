/**
 * Boundary: asynchronous Windows process bridge for this platform only.
 * Owns the fixed native script invocation and transport limits, not grouping,
 * HTTP routes, UI, or state. No shell interpolation or elevation is used.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../native/scan.ps1', import.meta.url));

export async function scanWindowsProcesses({ signal } = {}) {
  if (process.platform !== 'win32') {
    throw Object.assign(new Error('当前微信识别插件仅支持 Windows。'), { code: 'WINDOWS_REQUIRED' });
  }
  // SystemRoot is an OS installation path; use a fully qualified system binary,
  // never PATH resolution or request-supplied executable/script arguments.
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32',
    'WindowsPowerShell', 'v1.0', 'powershell.exe');
  let stdout;
  try {
    ({ stdout } = await execute(powershell,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', signal }));
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('微信识别已停止。'), { code: 'SCAN_CANCELLED', cause: error });
    const timedOut = error.killed || error.signal;
    throw Object.assign(new Error(timedOut ? '微信识别暂未完成，请稍后刷新。' : 'Windows 微信进程查询失败，请重试。'),
      { code: timedOut ? 'SCAN_TIMEOUT' : 'PROCESS_QUERY_FAILED', cause: error });
  }
  try {
    const result = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
    if (!Array.isArray(result.processes) || !Array.isArray(result.warnings)) throw new Error('Invalid snapshot');
    return result;
  } catch (error) {
    throw Object.assign(new Error('微信识别返回的数据暂不可用，请重试。'), { code: 'INVALID_SCAN_DATA', cause: error });
  }
}
