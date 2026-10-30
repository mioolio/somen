/** Boundary: connection loss is not proof that the process holding native callback pointers has terminated. */
export function createTargetLifetime() {
  let detached = false, targetTerminated = false;
  return {
    observeDetached(reason) { detached = true; if (reason === 'process-terminated') targetTerminated = true; },
    state() { return { detached, targetTerminated }; },
    disposalProof() { return targetTerminated ? { disposed: true } : { disposed: false, retained: true }; },
  };
}
