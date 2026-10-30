/** Boundary: correlate content-free Windows records with one exact process lifetime, then discard correlation fields. */
function processId(value) {
  if (typeof value === 'string' && /^(?:0x[0-9a-fA-F]{1,8}|[0-9]{1,10})$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function reportId(value) {
  return typeof value === 'string' && /^[{]?[a-f0-9-]{36}[}]?$/i.test(value) ? value.toLowerCase().replace(/[{}]/g, '') : null;
}
function diagnostic(record) {
  const code = typeof record.code === 'string' && /^(?:0x)?[0-9a-f]{8}$/i.test(record.code)
    ? `0x${record.code.replace(/^0x/i, '').toLowerCase()}` : null;
  const faultModule = typeof record.faultModule === 'string' && /^[A-Za-z0-9_.-]{1,100}\.(?:dll|exe)(?:_unloaded)?$/i.test(record.faultModule)
    && !record.faultModule.startsWith('wxid_') ? record.faultModule : null;
  const faultOffset = typeof record.faultOffset === 'string' && /^(?:0x)?[0-9a-f]{1,16}$/i.test(record.faultOffset) ? record.faultOffset : null;
  return { eventId: record.eventId, code, time: record.time, faultModule, ...(faultOffset ? { faultOffset } : {}) };
}
export function correlateCrashRecords(records, { pid, startedAt, until, processName }) {
  if (!Array.isArray(records) || records.length > 100) throw new Error('Invalid crash event data.');
  const from = Date.parse(startedAt), to = Date.parse(until);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const inScope = records.filter(record => {
    const at = Date.parse(record?.time);
    return record && [1000, 1001].includes(record.eventId) && record.application === processName
      && Number.isFinite(at) && at >= from && at <= to
      && (!record.processStartedAt || record.processStartedAt === startedAt);
  });
  const direct = inScope.filter(record => processId(record.pid) === pid);
  const reports = new Set(direct.filter(record => record.eventId === 1000).map(record => reportId(record.reportId)).filter(Boolean));
  return inScope.filter(record => direct.includes(record) || (record.eventId === 1001
    && processId(record.pid) === null && reports.has(reportId(record.reportId))))
    .map(diagnostic).sort((a, b) => a.time.localeCompare(b.time));
}
