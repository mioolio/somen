/**
 * 边界：已选实例的联系人和监控状态生命周期，不选择实例或执行发送。
 * 同一时刻仅有一次联系人操作；操作时废弃旧轮询，页面隐藏时暂停轮询。
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { readWorkspace, updateWorkspace } from '../api/workspace.js';

const emptyWorkspace = () => ({ binding: null, status: 'idle', contacts: [], target: null, capabilities: {}, recentEvents: [] });
export function useWorkspace() {
  const workspace = ref(emptyWorkspace());
  const loading = ref(true);
  const busy = ref(false);
  const readError = ref('');
  const actionError = ref('');
  const error = computed(() => actionError.value || readError.value);
  const connected = ref(false);
  let controller;
  let requestVersion = 0;
  let disposed = false;
  let timer;
  let refreshing = false;

  function accept(payload) {
    const value = payload.workspace || payload;
    if (!value || typeof value.status !== 'string') throw new Error('工作状态无效');
    workspace.value = { ...emptyWorkspace(), ...value };
    connected.value = true;
  }
  async function refresh({ clearErrors = false } = {}) {
    if (busy.value || disposed || refreshing) return;
    refreshing = true;
    if (clearErrors) actionError.value = '';
    controller?.abort();
    controller = new AbortController();
    const version = ++requestVersion;
    try {
      const payload = await readWorkspace(controller.signal);
      if (disposed || version !== requestVersion) return;
      accept(payload);
      readError.value = '';
    } catch (failure) {
      if (disposed || version !== requestVersion) return;
      readError.value = failure.message || '读取失败';
      connected.value = false;
    } finally {
      refreshing = false;
      if (!disposed && version === requestVersion) loading.value = false;
    }
  }
  async function change(path, body) {
    if (busy.value || disposed) return;
    busy.value = true;
    actionError.value = '';
    controller?.abort();
    requestVersion++;
    try {
      const payload = await updateWorkspace(path, body);
      if (!disposed && (payload.workspace || typeof payload.status === 'string')) accept(payload);
    } catch (failure) {
      if (!disposed) actionError.value = failure.message || '操作未完成';
    } finally {
      busy.value = false;
      if (!disposed) await refresh();
    }
  }
  const canSend = computed(() => connected.value && workspace.value.status === 'active' && Boolean(workspace.value.target?.id) && !busy.value);
  const bindingKey = computed(() => {
    const binding = workspace.value.binding;
    return binding ? `${binding.pid}:${binding.startedAt}:${binding.accountId}` : '';
  });
  onMounted(() => {
    void refresh();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
  });
  onBeforeUnmount(() => { disposed = true; controller?.abort(); requestVersion++; clearInterval(timer); });
  return {
    workspace, loading, busy, error, connected, canSend, bindingKey, refresh,
    loadContacts: () => change('/workspace/contacts', {}),
    selectTarget: contact => change('/workspace/target', { contactId: contact.id }),
  };
}
