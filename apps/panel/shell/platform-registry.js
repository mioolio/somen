/**
 * 边界：匹配后端成功加载的平台与前端注册文件，不了解平台内部行为。
 * 单个平台的前端加载失败只记录该插件故障，不阻止其他插件启动。
 */
import { shallowRef, ref, markRaw } from 'vue';

export const host = shallowRef({ platforms: [], failures: [], error: '' });
export const loadingHost = ref(true);
const available = new Set(['ready', 'active', 'loaded']);

export async function discoverPlatforms(modules) {
  loadingHost.value = true;
  try {
    const response = await fetch('/api/platforms', { cache: 'no-store' });
    if (!response.ok) throw new Error('暂时无法连接本地服务');
    const payload = await response.json();
    if (!Array.isArray(payload.platforms)) throw new Error('本地服务返回的平台列表无效');
    const platforms = [];
    const failures = payload.platforms
      .filter((item) => !available.has(item.status))
      .map((item) => ({ id: item.id, message: item.error || '平台暂时不可用' }));
    for (const item of payload.platforms.filter((entry) => available.has(entry.status))) {
      const entry = Object.entries(modules).find(([path]) =>
        path === `../../platforms/${item.id}/panel/register.js`,
      );
      if (!entry) {
        failures.push({ id: item.id, message: '未发现平台面板入口' });
        continue;
      }
      try {
        const { default: registration } = await entry[1]();
        if (registration.id !== item.id || !Array.isArray(registration.routes)) {
          throw new Error('平台注册信息不完整');
        }
        platforms.push(markRaw(registration));
      } catch {
        failures.push({ id: item.id, message: '平台面板加载失败' });
      }
    }
    host.value = { platforms, failures, error: '' };
  } catch (error) {
    host.value = { platforms: [], failures: [], error: error.message || '连接本地服务失败' };
  } finally {
    loadingHost.value = false;
  }
}
