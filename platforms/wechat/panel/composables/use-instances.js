/**
 * 边界：微信扫描的请求生命周期、搜索与可见页轮询；不操作宿主路由。
 * 页面卸载取消请求与定时器。失败保留上次结果并明确标记，避免伪装实时数据。
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { fetchInstances } from '../api/instances.js';

export function useInstances() {
  const snapshot = ref(null);
  const loading = ref(false);
  const error = ref('');
  const query = ref('');
  const autoRefresh = ref(false);
  let controller;
  let timer;
  let disposed = false;

  async function scan() {
    if (loading.value || disposed) return;
    loading.value = true;
    error.value = '';
    controller = new AbortController();
    // 请求上限独立于轮询周期；宿主异常时允许用户重新尝试。
    const timeout = setTimeout(() => controller.abort('timeout'), 90000);
    try {
      const result = await fetchInstances(controller.signal);
      if (!disposed) snapshot.value = result;
    } catch (failure) {
      if (!disposed) error.value = controller.signal.aborted
        ? '扫描等待时间较长，请重新尝试' : failure.message || '无法连接本地识别服务';
    } finally {
      clearTimeout(timeout);
      if (!disposed) loading.value = false;
    }
  }

  function configurePolling() {
    clearInterval(timer);
    if (autoRefresh.value) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void scan();
      }, 15000);
    }
  }

  const filteredInstances = computed(() => {
    const term = query.value.trim().toLocaleLowerCase();
    return (snapshot.value?.instances || []).filter((instance) =>
      !term || [instance.pid, instance.account?.id, instance.windowTitle, instance.version,
        ...(instance.processIds || []), ...(instance.candidates || []).map((item) => item.id)]
        .some((value) => String(value ?? '').toLocaleLowerCase().includes(term)),
    );
  });

  watch(autoRefresh, configurePolling);
  onMounted(scan);
  onBeforeUnmount(() => {
    disposed = true;
    controller?.abort();
    clearInterval(timer);
  });

  return { snapshot, loading, error, query, autoRefresh, filteredInstances, scan };
}
