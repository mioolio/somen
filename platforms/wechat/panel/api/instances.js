/** 边界：只处理微信识别 HTTP 协议；不持有页面状态或触发轮询。 */
export async function fetchInstances(signal) {
  const response = await fetch('/api/wechat/instances', { signal, cache: 'no-store' });
  if (!response.ok) {
    let message = '本次扫描未完成，请稍后重试';
    try {
      const body = await response.json();
      message = typeof body.message === 'string' ? body.message :
        typeof body.error?.message === 'string' ? body.error.message :
        typeof body.error === 'string' ? body.error : message;
    } catch { /* 非 JSON 故障响应使用稳定的界面提示。 */ }
    throw new Error(message);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.instances) || !Array.isArray(payload.warnings)) {
    throw new Error('扫描结果格式不完整，请重新扫描');
  }
  return payload;
}
