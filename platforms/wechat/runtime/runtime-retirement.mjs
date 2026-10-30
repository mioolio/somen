/**
 * Boundary: quarantine former native runtimes after the workspace stops using them.
 * Disposal is best-effort business shutdown, never permission to unload callbacks.
 * Retained or unresponsive owners stay reachable without delaying platform selection.
 */
export function createRuntimeRetirement({ onEvent = () => {} } = {}) {
  const owners = new Set();
  const emit = (event, scope) => { try { onEvent(event, scope); } catch { /* Cleanup diagnostics cannot block selection. */ } };
  return {
    get count() { return owners.size; },
    retire(runtime, scope) {
      if (!runtime || owners.has(runtime)) return;
      owners.add(runtime);
      let completion;
      try { completion = runtime.dispose(); }
      catch (error) { emit({ type: 'native.retirement-failed', error }, scope); return; }
      void Promise.resolve(completion).then(result => {
        if (result?.disposed === true) owners.delete(runtime);
        emit({ type: result?.disposed === true ? 'native.retirement-completed' : 'native.owner-retained' }, scope);
      }, error => emit({ type: 'native.retirement-failed', error }, scope));
    },
  };
}
