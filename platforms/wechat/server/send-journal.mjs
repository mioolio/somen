import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { withJournalLock } from './journal-lock.mjs';

/** Boundary: durable idempotency and outcomes only; never persists content or raw identities. */
export function createSendJournal({ directory }) {
  const file = join(directory, 'send-journal.json');
  let records, queue = Promise.resolve();
  async function load() {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.records)) throw new Error('invalid');
      records = new Map(parsed.records.map(item => [item.requestId, item]));
    } catch (error) {
      if (error.code === 'ENOENT') records = new Map();
      else throw Object.assign(new Error('发送账本不可用。'), { code: 'JOURNAL_UNAVAILABLE' });
    }
  }
  async function persist() {
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, records: [...records.values()] }), { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  }
  function transaction(operation) {
    const result = queue.then(() => withJournalLock(directory, async () => { await load(); return operation(); }));
    queue = result.catch(() => {});
    return result;
  }
  return {
    reserve({ requestId, kind, scope, payload }) {
      return transaction(async () => {
        if (typeof requestId !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(requestId)) {
          throw Object.assign(new Error('发送请求编号无效。'), { code: 'INVALID_REQUEST_ID' });
        }
        const fingerprint = createHash('sha256').update(JSON.stringify({ kind, scope, payload })).digest('hex');
        const previous = records.get(requestId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw Object.assign(new Error('请求编号已用于其他内容。'), { code: 'REQUEST_ID_CONFLICT' });
          return { fresh: false, record: { ...previous } };
        }
        if (records.size >= 5000) throw Object.assign(new Error('发送账本需要归档。'), { code: 'JOURNAL_FULL' });
        const record = { requestId, kind, fingerprint, status: 'unknown', at: new Date().toISOString() };
        records.set(requestId, record);
        // Reserve on disk before submitting anything to the native worker.
        await persist();
        return { fresh: true, record: { ...record } };
      });
    },
    finish(requestId, receipt) {
      return transaction(async () => {
        const record = records.get(requestId);
        if (!record) throw new Error('Missing reserved request');
        Object.assign(record, { status: receipt.status, completedAt: new Date().toISOString(),
          ...(receipt.localId ? { localId: String(receipt.localId) } : {}), deliveryConfirmed: receipt.deliveryConfirmed === true });
        await persist();
        return { ...record };
      });
    },
  };
}
