import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

/** Boundary: cross-host exclusive journal transactions. Uncertain locks fail closed instead of guessing stale ownership. */
export async function withJournalLock(directory, operation) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'send-journal.lock');
  const token = randomUUID();
  let handle;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
        await handle.sync();
      } catch (writeError) { await handle.close(); handle = null; throw writeError; }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      await delay(25);
    }
  }
  if (!handle) throw Object.assign(new Error('发送账本正被其他宿主使用。'), { code: 'JOURNAL_BUSY' });
  try { return await operation(); }
  finally {
    await handle.close();
    const owner = JSON.parse(await readFile(path, 'utf8'));
    if (owner.token === token) await unlink(path);
  }
}
