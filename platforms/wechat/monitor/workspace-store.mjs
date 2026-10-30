import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireWorkspaceIdentity } from './identity.mjs';

/** Boundary: explicit user workspace selection persists locally; no contacts, messages or scan snapshots are stored. */
export function createWorkspaceStore({ directory }) {
  const path = join(directory, 'workspace.json');
  let pendingWrite = Promise.resolve();
  async function writeSelection(identity, enabled) {
    const value = { schemaVersion: 1, enabled, identity: requireWorkspaceIdentity(identity) };
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `workspace.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
    } catch (error) {
      throw Object.assign(new Error('工作微信配置保存失败。'), { code: 'WORKSPACE_STORE_FAILED', cause: error });
    } finally { await unlink(temporary).catch(() => {}); }
  }
  return {
    async read() {
      let value;
      try { value = JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw Object.assign(new Error('工作微信配置不可读取。'), { code: 'WORKSPACE_STORE_INVALID' }); }
      if (value?.schemaVersion !== 1 || typeof value.enabled !== 'boolean') {
        throw Object.assign(new Error('工作微信配置无效。'), { code: 'WORKSPACE_STORE_INVALID' });
      }
      return { identity: requireWorkspaceIdentity(value.identity), enabled: value.enabled };
    },
    write(identity, enabled = true) {
      const operation = pendingWrite.catch(() => {}).then(() => writeSelection(identity, enabled));
      pendingWrite = operation;
      return operation;
    },
  };
}
