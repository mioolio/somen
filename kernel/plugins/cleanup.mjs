/** Boundary: release plugin-owned resources without letting stalled asynchronous cleanup block the host. */
export async function releaseResources(cleanups, timeoutMs = 1000) {
  let timer;
  try {
    await Promise.race([
      Promise.allSettled(cleanups.splice(0).map(cleanup => Promise.resolve().then(cleanup))),
      new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
