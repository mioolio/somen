import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boundary: private resident PowerShell transport for fresh read-only snapshots.
 * Only the fixed scan command crosses stdin; no HTTP values become shell code.
 * Cancelling or replacing this scanner never touches native callback owners.
 */
export function createScannerBridge({ spawnImpl = spawn, timeoutMs = 20_000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = fileURLToPath(new URL('../native/scan-worker.ps1', import.meta.url));
  let connection, sequence = Promise.resolve();
  const failure = code => Object.assign(new Error(code === 'SCAN_CANCELLED' ? '微信识别已停止。'
    : code === 'SCAN_TIMEOUT' ? '微信识别暂未完成，请稍后刷新。' : 'Windows 微信进程查询失败，请重试。'), { code });
  function reset(current, error) {
    if (connection !== current) return;
    connection = undefined;
    current.pending?.reject(error);
    current.pending = undefined;
    // This child only owns read-only Windows handles, never Frida/native callbacks.
    try { current.child.kill(); } catch { /* It may have already exited. */ }
  }
  function connect() {
    if (connection) return connection;
    const child = spawnImpl(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const current = { child, buffer: '', pending: undefined };
    connection = current;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (connection !== current) return;
      current.buffer += chunk;
      if (Buffer.byteLength(current.buffer, 'utf8') > maxBytes) { reset(current, failure('INVALID_SCAN_DATA')); return; }
      let newline;
      while ((newline = current.buffer.indexOf('\n')) !== -1) {
        const line = current.buffer.slice(0, newline).replace(/^\uFEFF/, '').trim();
        current.buffer = current.buffer.slice(newline + 1);
        if (!current.pending || !line) { reset(current, failure('INVALID_SCAN_DATA')); return; }
        try {
          const result = JSON.parse(line);
          if (result.ok !== true) { reset(current, failure('PROCESS_QUERY_FAILED')); return; }
          if (!Array.isArray(result.snapshot?.processes) || !Array.isArray(result.snapshot?.warnings)) throw new Error('Invalid snapshot');
          const pending = current.pending; current.pending = undefined;
          pending.resolve(result.snapshot);
        } catch { reset(current, failure('INVALID_SCAN_DATA')); return; }
      }
    });
    // Never print raw scanner stderr; it can contain local paths or identifiers.
    child.stderr.on('data', () => {});
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', () => reset(current, failure('PROCESS_QUERY_FAILED')));
    child.on('error', () => reset(current, failure('PROCESS_QUERY_FAILED')));
    child.on('exit', () => reset(current, failure('PROCESS_QUERY_FAILED')));
    // Server/owner lifetimes keep their own handles; an idle reader must not pin them.
    child.unref();
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.unref?.();
    return current;
  }
  async function request(signal) {
    if (signal?.aborted) throw failure('SCAN_CANCELLED');
    const current = connect();
    let timer, onAbort;
    try {
      return await new Promise((resolve, reject) => {
        current.pending = { resolve, reject };
        timer = setTimeout(() => reset(current, failure('SCAN_TIMEOUT')), timeoutMs);
        onAbort = () => reset(current, failure('SCAN_CANCELLED'));
        signal?.addEventListener('abort', onAbort, { once: true });
        current.child.stdin.write('scan\n', 'utf8', error => { if (error) reset(current, failure('PROCESS_QUERY_FAILED')); });
      });
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }
  return {
    scan({ signal } = {}) {
      const operation = sequence.then(() => request(signal));
      sequence = operation.catch(() => {});
      return operation;
    },
    close() { if (connection) reset(connection, failure('SCAN_CANCELLED')); },
  };
}
