import { createHmac, randomBytes } from 'node:crypto';

/** Boundary: exact workspace identity and anonymous diagnostic references, with no OS or persistence access. */
const referenceKey = randomBytes(32);
export function requireWorkspaceIdentity(value) {
  if (!value || !Number.isSafeInteger(value.pid) || value.pid < 1
    || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))
    || typeof value.accountId !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/.test(value.accountId)) {
    throw Object.assign(new Error('工作微信身份不完整，请重新选择。'), { code: 'WORKSPACE_IDENTITY_INVALID' });
  }
  return { pid: value.pid, startedAt: value.startedAt, accountId: value.accountId };
}

export function sessionReference(identity) {
  return createHmac('sha256', referenceKey)
    .update(`${identity.pid}\0${identity.startedAt}\0${identity.accountId}`).digest('hex').slice(0, 24);
}

export function inspectWorkspaceIdentity(snapshot, identity) {
  if (!snapshot || !Array.isArray(snapshot.instances)) return { code: 'SCAN_DATA_INVALID', message: '微信识别结果无效。' };
  const row = snapshot.instances.find(item => item.pid === identity.pid);
  if (!row) return { code: 'WORKSPACE_PROCESS_MISSING', message: '工作微信进程已退出或暂不可见。' };
  // Preserve the native timestamp, including its sub-millisecond precision.
  if (row.startedAt !== identity.startedAt) return { code: 'WORKSPACE_PROCESS_REPLACED', message: '工作微信进程已变化，请重新选择。' };
  if (row.status !== 'identified' || !row.account?.id || row.account.verified === false) {
    return { code: 'WORKSPACE_ACCOUNT_UNVERIFIED', message: '工作微信账号暂未确认。' };
  }
  if (row.account.id !== identity.accountId) return { code: 'WORKSPACE_ACCOUNT_CHANGED', message: '工作微信账号已变化，请重新选择。' };
  return null;
}
