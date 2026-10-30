/** 边界：平台选择器的工作实例绑定协议；仅提交已选实例身份，不读取联系人或调用原生运行。 */
import { readWorkspace, workspaceRequest } from './workspace.js';

export const readWorkSelection = async signal => {
  const response = await readWorkspace(signal);
  return response.workspace || response;
};
export function isCurrentWorkInstance(workspace, instance) {
  const binding = workspace?.binding;
  return Boolean(binding && instance && binding.pid === instance.pid
    && binding.startedAt === instance.startedAt && typeof instance.account?.id === 'string'
    && binding.accountId === instance.account.id);
}

export async function selectWorkInstance(instance) {
  if (!instance || instance.role !== 'main' || instance.status !== 'identified'
    || instance.account?.verified !== true || !Number.isSafeInteger(instance.pid)
    || instance.pid < 1 || typeof instance.startedAt !== 'string' || !instance.startedAt) {
    throw new Error('请刷新后选择已确认的实例');
  }
  // Every click submits selection intent. The backend owns exact-binding
  // idempotency, fresh identity checks and preservation of unknown-send locks.
  const response = await workspaceRequest('/workspace/select', {
    method: 'POST', body: { pid: instance.pid, startedAt: instance.startedAt },
  });
  const workspace = response.workspace || response;
  if (!isCurrentWorkInstance(workspace, instance)) {
    throw new Error(workspace.reason?.message || '工作实例尚未确认');
  }
  return workspace;
}
