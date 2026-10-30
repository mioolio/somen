/** 边界：平台选择器的工作实例绑定协议；仅提交已选实例身份，不读取联系人或调用原生运行。 */
import { readWorkspace, workspaceRequest } from './workspace.js';

export const readWorkSelection = async signal => {
  const response = await readWorkspace(signal);
  return response.workspace || response;
};
export function isCurrentWorkInstance(workspace, instance) {
  return workspace?.status === 'active' && workspace.binding?.pid === instance?.pid
    && workspace.binding?.startedAt === instance?.startedAt
    && workspace.binding?.accountId === instance?.account?.id;
}

export async function selectWorkInstance(instance) {
  if (!instance || instance.role !== 'main' || instance.status !== 'identified'
    || instance.account?.verified !== true || !Number.isSafeInteger(instance.pid)
    || instance.pid < 1 || typeof instance.startedAt !== 'string' || !instance.startedAt) {
    throw new Error('请刷新后选择已确认的实例');
  }
  // Read before every click action: an already active binding must never be rebuilt.
  const current = await readWorkSelection();
  if (isCurrentWorkInstance(current, instance)) return current;
  const response = await workspaceRequest('/workspace/select', {
    method: 'POST', body: { pid: instance.pid, startedAt: instance.startedAt },
  });
  const workspace = response.workspace || response;
  if (workspace.status !== 'active' || workspace.binding?.pid !== instance.pid
    || workspace.binding?.startedAt !== instance.startedAt
    || workspace.binding?.accountId !== instance.account.id) {
    throw new Error(workspace.reason?.message || '工作实例尚未确认');
  }
  return workspace;
}
