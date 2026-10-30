/** 边界：微信面板纯展示格式化；不修改扫描结果，不推断账号或登录状态。 */
export function formatTime(value, withDate = false) {
  if (!value) return '尚未扫描';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未获取';
  return new Intl.DateTimeFormat('zh-CN', withDate
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date);
}

export function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return '—';
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(1)} s`;
}
