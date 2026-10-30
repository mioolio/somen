/**
 * Boundary: asynchronous Windows process bridge for this platform only.
 * Owns the fixed native script invocation and transport limits, not grouping,
 * HTTP routes, UI, or state. No shell interpolation or elevation is used.
 */
import { createScannerBridge } from './scanner-bridge.mjs';

const scanner = createScannerBridge();

export async function scanWindowsProcesses({ signal } = {}) {
  if (process.platform !== 'win32') {
    throw Object.assign(new Error('当前微信识别插件仅支持 Windows。'), { code: 'WINDOWS_REQUIRED' });
  }
  return scanner.scan({ signal });
}
