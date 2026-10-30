import { basename } from 'node:path';

/** Boundary: a diagnostic allowlist excludes account IDs, contacts, content, command lines and machine paths. */
const numeric = new Set(['pid', 'exitCode', 'durationMs', 'attempt', 'count', 'eventId']);
const labels = new Set(['code', 'phase', 'operation', 'signal', 'origin']);
export function diagnosticFields(details = {}) {
  const result = {};
  for (const [key, value] of Object.entries(details || {})) {
    if (numeric.has(key) && (Number.isFinite(value) || value === null)) result[key] = value;
    if (labels.has(key) && typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value)
      && !value.startsWith('wxid_')) result[key] = value;
    if (key === 'sessionRef' && typeof value === 'string' && /^[a-f0-9]{24}$/.test(value)) result.sessionRef = value;
    if (key === 'time' && typeof value === 'string' && Number.isFinite(Date.parse(value))) result.time = new Date(value).toISOString();
    if (key === 'faultModule' && typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}\.(?:dll|exe)(?:_unloaded)?$/i.test(value)
      && !value.startsWith('wxid_')) result.faultModule = value;
    if (key === 'faultOffset' && typeof value === 'string' && /^(?:0x)?[a-f0-9]{1,16}$/i.test(value)) result.faultOffset = value;
  }
  if (details?.error) {
    const error = details.error;
    if (typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)) result.errorCode = error.code;
    result.errorType = typeof error.name === 'string' && /^[A-Za-z]{1,64}$/.test(error.name) ? error.name : 'Error';
    // Keep only source basename + line/column from V8 frames; drop the error message.
    result.frames = typeof error.stack === 'string' ? error.stack.split('\n').slice(1, 9).flatMap(line => {
      const match = line.match(/(?:[\\/])([^\\/():]+\.[cm]?js):(\d+):(\d+)\)?\s*$/);
      return match ? [`${basename(match[1])}:${match[2]}:${match[3]}`] : [];
    }) : [];
  }
  return result;
}

export function diagnosticRecord(type, details, now = Date.now) {
  if (typeof type !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(type) || type.startsWith('wxid_')) {
    throw new TypeError('Diagnostic event type must be a fixed event name.');
  }
  return { at: new Date(now()).toISOString(), type, ...diagnosticFields(details) };
}
