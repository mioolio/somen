/** Boundary: explicit strong references for attached sessions/scripts, including factory failures. */
export function retainNativeOwner(registry, session) {
  const owner = { session, scripts: new Set() };
  registry.add(owner);
  try {
    session.detached.connect(reason => {
      if (reason !== 'process-terminated') return;
      registry.delete(owner);
      owner.scripts.clear();
    });
  } catch (error) { error.safeToExit = false; throw error; }
  return owner;
}
