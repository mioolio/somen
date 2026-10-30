import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticRecord } from './log-fields.mjs';

/**
 * Boundary: bounded local JSONL diagnostics, serialized rotation and emergency synchronous exit records.
 * Callers pass only fixed event names and the allowlisted metadata; raw data is never serialized.
 */
export function createEventLog({ directory, maxBytes = 1024 * 1024, maxFiles = 5, now = Date.now } = {}) {
  if (!directory) throw new TypeError('A local diagnostic directory is required.');
  const limit = Math.max(256, Math.min(Number(maxBytes) || 1024 * 1024, 16 * 1024 * 1024));
  const files = Math.max(1, Math.min(Math.trunc(Number(maxFiles) || 5), 10));
  const path = index => join(directory, index ? `monitor.${index}.jsonl` : 'monitor.jsonl');
  let queue = Promise.resolve();
  let status = { available: true, code: null };
  let closed = false;
  async function rotate(bytes) {
    let size = 0;
    try { size = (await stat(path(0))).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!size || size + bytes <= limit) return;
    await unlink(path(files - 1)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    for (let index = files - 2; index >= 0; index--) {
      await rename(path(index), path(index + 1)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  function record(type, details = {}) {
    if (closed) return Promise.resolve(false);
    let line;
    try { line = `${JSON.stringify(diagnosticRecord(type, details, now))}\n`; }
    catch { return Promise.resolve(false); }
    const operation = queue.then(async () => {
      await mkdir(directory, { recursive: true });
      await rotate(Buffer.byteLength(line));
      await appendFile(path(0), line, { encoding: 'utf8', mode: 0o600 });
      status = { available: true, code: null };
      return true;
    }).catch(error => { status = { available: false, code: error.code || 'LOG_WRITE_FAILED' }; return false; });
    queue = operation;
    return operation;
  }
  function recordSync(type, details = {}) {
    if (closed) return false;
    try {
      const line = `${JSON.stringify(diagnosticRecord(type, details, now))}\n`;
      mkdirSync(directory, { recursive: true });
      let size = 0;
      try { size = statSync(path(0)).size; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (size && size + Buffer.byteLength(line) > limit) {
        try { unlinkSync(path(files - 1)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        for (let index = files - 2; index >= 0; index--) {
          try { renameSync(path(index), path(index + 1)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      appendFileSync(path(0), line, { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch (error) { status = { available: false, code: error.code || 'LOG_WRITE_FAILED' }; return false; }
  }
  return {
    record, recordSync,
    getStatus: () => ({ ...status }),
    flush: () => queue,
    async dispose() { closed = true; await queue; },
  };
}
