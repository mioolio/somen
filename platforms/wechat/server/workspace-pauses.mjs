import { sessionReference } from '../monitor/identity.mjs';

/** Boundary: switching work context must not clear a native uncertainty belonging to the same process/account lifetime. */
export function createWorkspacePauses() {
  const paused = new Map();
  return {
    remember(binding, state) {
      if (binding && state.blocked) paused.set(sessionReference(binding), structuredClone(state));
    },
    restore(binding) {
      return structuredClone(paused.get(sessionReference(binding)) || { blocked: false, lastReceipt: null });
    },
  };
}
