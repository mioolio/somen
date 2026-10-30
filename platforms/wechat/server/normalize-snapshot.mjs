/**
 * Boundary: pure process grouping and identity evidence policy, no OS access.
 * Processes marked auxiliary are attached through their current parent chain.
 * An unclassified process remains visible; a directory name is never promoted to wxid.
 */
export function normalizeSnapshot(raw, { scannedAt = new Date().toISOString(), durationMs = 0 } = {}) {
  const processes = (raw.processes || []).filter(row => Number.isSafeInteger(row.pid) && row.pid > 0);
  const byPid = new Map(processes.map(row => [row.pid, row]));
  const warnings = [...(raw.warnings || [])];
  const groups = new Map();
  for (const row of processes) {
    let root = row;
    const visited = new Set([row.pid]);
    while (root.role === 'auxiliary' && byPid.has(root.parentPid) && !visited.has(root.parentPid)) {
      const parent = byPid.get(root.parentPid);
      if (parent.executablePath && root.executablePath && parent.executablePath.toLowerCase() !== root.executablePath.toLowerCase()) break;
      // PID reuse must not attach an older process beneath a younger process.
      if (parent.startedAt && root.startedAt && Date.parse(parent.startedAt) > Date.parse(root.startedAt)) break;
      root = parent;
      visited.add(root.pid);
    }
    if (!groups.has(root.pid)) groups.set(root.pid, []);
    groups.get(root.pid).push(row);
  }
  const instances = [...groups].map(([pid, members]) => {
    const root = byPid.get(pid);
    const unique = new Map();
    // Only the main/root owner can confirm an identity. Child caches may refer to other accounts.
    for (const account of root.accounts || []) {
      if (!account || typeof account.id !== 'string' || !account.id.trim()) continue;
      const key = `${account.id}:${account.source}`;
      if (!unique.has(key) || account.verified === true) unique.set(key, account);
    }
    const candidates = [...unique.values()].map(({ id, source, evidence, verified }) => ({ id, source, evidence, verified: verified === true }));
    const verified = candidates.filter(item => item.verified);
    const verifiedIds = new Set(verified.map(item => item.id));
    const status = verifiedIds.size === 1 ? 'identified' : verifiedIds.size > 1 || new Set(candidates.map(item => item.id)).size > 1 ? 'ambiguous' : 'unidentified';
    const account = status === 'identified' ? verified[0] : null;
    if (root.role !== 'main') warnings.push({ code: 'PROCESS_ROLE_UNCERTAIN', message: `PID ${pid} 的主进程身份尚未确认，已单独保留。` });
    return {
      id: `${pid}:${root.startedAt || 'unknown'}`,
      pid, parentPid: root.parentPid ?? null,
      processName: root.processName || '',
      version: root.version || null,
      executablePath: root.executablePath || null,
      windowTitle: root.windowTitle || '',
      startedAt: root.startedAt || null,
      status, account, candidates,
      role: root.role || 'unknown',
      processIds: members.map(item => item.pid).sort((a, b) => a - b),
    };
  }).sort((a, b) => a.pid - b.pid);
  return {
    scannedAt, durationMs,
    processCount: processes.length,
    instanceCount: instances.length,
    confirmedInstanceCount: instances.filter(item => item.role === 'main').length,
    identifiedCount: instances.filter(item => item.status === 'identified').length,
    instances, warnings,
    cached: false,
  };
}
