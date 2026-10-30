/** 边界：平台选择器的一次性绑定操作和错误状态；挂载不选择、不重试，不负责路由或业务运行。 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { selectWorkInstance, readWorkSelection, isCurrentWorkInstance } from '../api/platform-selection.js';

export function usePlatformSelection() {
  const selectingKey = ref('');
  const error = ref('');
  const current = ref(null);
  const selecting = computed(() => Boolean(selectingKey.value));
  const instanceKey = instance => `${instance?.pid}:${instance?.startedAt}`;
  const controller = new AbortController();
  let disposed = false;
  let revision = 0;
  async function select(instance) {
    if (selecting.value) return null;
    revision++;
    error.value = '';
    selectingKey.value = instanceKey(instance);
    try {
      const workspace = await selectWorkInstance(instance);
      if (!disposed) current.value = workspace;
      return disposed ? null : workspace;
    }
    catch (failure) { error.value = failure.message || '设置未完成'; return null; }
    finally { selectingKey.value = ''; }
  }
  onMounted(() => {
    const currentRevision = revision;
    void readWorkSelection(controller.signal).then(workspace => {
      if (!disposed && currentRevision === revision) current.value = workspace;
    }).catch(() => {});
  });
  onBeforeUnmount(() => { disposed = true; controller.abort(); });
  return { selecting, selectingKey, error, select, instanceKey, isWorking: instance => isCurrentWorkInstance(current.value, instance) };
}
