import { setTimeout as delay } from 'node:timers/promises';

/**
 * Boundary: wait for business work only. Retained callback/task memory is owned
 * separately and never proves that unloading or terminating an owner is safe.
 */
export function nativeWorkPending(state) {
  return ['pendingTasks', 'pendingCallbacks', 'activeReads'].some(field => (state[field] || 0) > 0);
}

export async function waitForNativeIdle(scripts, { attempts = 30, pause = delay } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let pending = false;
    for (const script of scripts.values()) {
      if (nativeWorkPending(await script.exports.inspect())) pending = true;
    }
    if (!pending) return true;
    await pause(200);
  }
  return false;
}
