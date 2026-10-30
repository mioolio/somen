/** 边界：只加载服务端真实表情列表与搜索结果，取消过期搜索，不生成演示表情。 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { workspaceRequest } from '../api/workspace.js';

export function useEmoticons(bindingKey) {
  const query = ref('');
  const kind = ref('all');
  const items = ref([]);
  const supported = ref(false);
  const loading = ref(false);
  const error = ref('');
  const message = ref('');
  let controller, timer;
  let disposed = false;
  let version = 0;
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const current = ++version;
    loading.value = true;
    error.value = '';
    try {
      const result = await workspaceRequest(`/emoticons?query=${encodeURIComponent(query.value.trim())}`, { signal: controller.signal, timeout: 15000 });
      if (disposed || version !== current) return;
      if (!Array.isArray(result.items)) throw new Error('表情列表无效');
      items.value = result.items;
      supported.value = result.supported === true;
      message.value = result.message || '';
    } catch (failure) {
      if (disposed || version !== current) return;
      items.value = [];
      supported.value = false;
      error.value = failure.message || '表情读取失败';
    } finally { if (!disposed && version === current) loading.value = false; }
  }
  watch(query, () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  watch(bindingKey, () => { items.value = []; query.value = ''; void load(); });
  onMounted(load);
  onBeforeUnmount(() => { disposed = true; version++; controller?.abort(); clearTimeout(timer); });
  const filteredItems = computed(() => items.value.filter(item => kind.value === 'all'
    || (kind.value === 'emoji' ? item.kind === 'emoji' : item.kind !== 'emoji')));
  return { query, kind, items: filteredItems, supported, loading, error, message, load };
}
