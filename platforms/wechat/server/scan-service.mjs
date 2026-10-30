import { scanWindowsProcesses } from './probe.mjs';
import { normalizeSnapshot } from './normalize-snapshot.mjs';

/**
 * Boundary: coalesce concurrent requests and cache successful scans briefly.
 * A failed scan is surfaced as an error, never replaced by a fake empty success.
 * Account identifiers live in memory only, are never persisted or logged.
 */
export function createScanService({ probe = scanWindowsProcesses, now = () => Date.now(), ttl = 2000 } = {}) {
  let last;
  let completedAt = 0;
  let inFlight;
  let disposed = false;
  const controller = new AbortController();
  return {
    async scan() {
      if (disposed) throw Object.assign(new Error('微信插件已停止。'), { code: 'PLUGIN_STOPPED' });
      if (last && now() - completedAt < ttl) return { ...last, cached: true };
      if (inFlight) return inFlight;
      const started = now();
      inFlight = Promise.resolve().then(() => probe({ signal: controller.signal })).then(raw => {
        const result = normalizeSnapshot(raw, {
          scannedAt: new Date(now()).toISOString(), durationMs: Math.max(0, now() - started),
        });
        if (!disposed) { last = result; completedAt = now(); }
        return result;
      }).finally(() => { inFlight = undefined; });
      return inFlight;
    },
    dispose() { disposed = true; controller.abort(); last = undefined; },
  };
}
