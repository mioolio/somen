/**
 * 边界：单次发送请求与回执展示。无重发、定时发送或消息持久化。
 * 未确认结果锁住后续发送；已提交表示原生调用结束，可发送新的草稿。
 */
import { ref, computed, watch } from 'vue';
import { updateWorkspace } from '../api/workspace.js';

export function useWorkspaceSend({ workspace, canSend, bindingKey, refresh }) {
  const sending = ref(false);
  const receipt = ref(null);
  const error = ref('');
  const uncertain = ref(false);
  const enabled = computed(() => canSend.value && !sending.value && !uncertain.value);
  watch(bindingKey, () => { receipt.value = null; error.value = ''; uncertain.value = false; });
  watch(() => workspace.value.lastReceipt, value => {
    if (!value || value.requestId !== receipt.value?.requestId) return;
    if (value.status === 'sent' || value.status === 'failed') {
      receipt.value = value;
      uncertain.value = false;
    }
  });
  async function send(path, payload) {
    if (!enabled.value) return false;
    const capability = ({ '/send/text': 'text', '/send/image': 'image', '/send/emoticon': 'emoticon' })[path];
    if (workspace.value.capabilities?.[capability] !== true) return false;
    const requestId = crypto.randomUUID();
    const account = bindingKey.value;
    sending.value = true;
    error.value = '';
    receipt.value = { requestId, status: 'pending' };
    try {
      const result = await updateWorkspace(path, { ...payload, requestId });
      if (account !== bindingKey.value) return false;
      const responseReceipt = result.receipt || result;
      const status = ['sent', 'submitted', 'unknown', 'failed'].includes(responseReceipt.status) ? responseReceipt.status : 'unknown';
      receipt.value = { ...responseReceipt, requestId, status };
      uncertain.value = status === 'unknown';
      return status === 'sent' || status === 'submitted';
    } catch (failure) {
      if (account !== bindingKey.value) return false;
      const unknown = failure.outcome !== 'not-sent';
      error.value = failure.message || '发送未完成';
      receipt.value = { requestId, status: unknown ? 'unknown' : 'failed' };
      uncertain.value = unknown;
      return false;
    } finally {
      sending.value = false;
      await refresh();
    }
  }
  return {
    sending, receipt, error, uncertain, enabled,
    sendText: content => send('/send/text', { content }),
    sendImage: image => send('/send/image', image),
    sendEmoticon: emoticonId => send('/send/emoticon', { emoticonId }),
    clearUncertain: () => { uncertain.value = false; },
  };
}
