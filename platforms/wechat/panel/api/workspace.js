/**
 * 边界：工作微信 HTTP 协议。请求只执行一次；发送超时不自动重试。
 * 错误携带 outcome，供发送界面区分已拒绝与结果未确认。
 */
export async function workspaceRequest(path, { method = 'GET', body, signal, timeout = 45000 } = {}) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  let response;
  try {
    response = await fetch(`/api/wechat${path}`, {
      method, signal: requestSignal, cache: 'no-store',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw Object.assign(new Error(requestSignal.aborted ? '请求超时或已取消' : '连接失败'), {
      code: 'CONNECTION_FAILED', outcome: 'unknown', cause,
    });
  }
  let payload;
  try { payload = await response.json(); }
  catch (cause) { throw Object.assign(new Error('服务响应无效'), { code: 'INVALID_RESPONSE', outcome: 'unknown', cause }); }
  if (!response.ok) {
    const error = payload.error || payload;
    throw Object.assign(new Error(typeof error.message === 'string' ? error.message : '操作未完成'), {
      code: error.code || 'REQUEST_FAILED',
      outcome: error.outcome || (response.status >= 500 ? 'unknown' : 'not-sent'),
    });
  }
  return payload;
}

export const readWorkspace = signal => workspaceRequest('/workspace', { signal, timeout: 10000 });
export const readWorkspaceInstances = signal => workspaceRequest('/instances', { signal, timeout: 25000 });
export const updateWorkspace = (path, body) => workspaceRequest(path, { method: 'POST', body });
