import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createWorkspaceMonitor } from '../monitor/workspace-monitor.mjs';
import { createNativeRuntime } from '../runtime/native-runtime.mjs';
import { createRuntimeRetirement } from '../runtime/runtime-retirement.mjs';
import { scanWindowsProcesses } from './probe.mjs';
import { normalizeSnapshot } from './normalize-snapshot.mjs';
import { individualContacts } from './contact-scope.mjs';
import { createSendJournal } from './send-journal.mjs';
import { stageImageUpload } from './image-upload.mjs';
import { createEmoticonService } from './emoticon-service.mjs';
import { createWorkspacePauses } from './workspace-pauses.mjs';

/**
 * Boundary: selected account + one-contact authorization + native action lifecycle.
 * All operations are serialized. Monitoring remains independent and revokes sends
 * after identity loss. A durable request reservation precedes each native send.
 */
export function createWorkspaceService({ scan = async () => normalizeSnapshot(await scanWindowsProcesses()),
  runtimeFactory = createNativeRuntime,
  directory = fileURLToPath(new URL('../../../.local/wechat/', import.meta.url)),
} = {}) {
  let binding = null, runtime = null, contacts = [], target = null, blocked = false, lastReceipt = null;
  let runtimeCapabilities = {};
  const runtimeScopes = new WeakMap();
  const pauses = createWorkspacePauses();
  let queue = Promise.resolve(), runtimeRevision = 0, disposed = false;
  const journal = createSendJournal({ directory });
  const monitor = createWorkspaceMonitor({ scan, directory });
  const retiredRuntimes = createRuntimeRetirement({ onEvent: (event, scope) => {
    void monitor.recordEvent(event.type, event, scope).catch(() => {});
  } });
  const emoticons = createEmoticonService({ getBinding: () => binding, sendToken: input => send('text', input) });
  const exclusive = operation => { const result = queue.then(operation); queue = result.catch(() => {}); return result; };
  const noSend = (message, code = 'WORKSPACE_NOT_READY') => Object.assign(new Error(message), { code, statusCode: 409, outcome: 'not-sent' });
  function requireActive(state = monitor.getState()) {
    if (disposed) throw noSend('工作会话已停止。', 'WORKSPACE_DISPOSED');
    if (!binding || state.status !== 'active' || !state.canSend) throw noSend(state.reason?.message || '请重新选择工作微信。');
    if (blocked) throw noSend('上次操作结果未确认，发送已暂停。', 'SEND_OUTCOME_UNKNOWN');
  }
  async function active() { requireActive(await monitor.checkNow()); }
  async function ensureRuntime() {
    await active();
    if (binding && !binding.version) {
      const snapshot = await scan();
      const instance = snapshot.instances.find(row => row.pid === binding.pid && row.startedAt === binding.startedAt && row.account?.id === binding.accountId);
      if (!instance) throw noSend('工作微信已变化。');
      binding = { ...binding, version: instance.version, executablePath: instance.executablePath };
    }
    if (!runtime) {
      const revision = runtimeRevision;
      const eventScope = monitor.captureEventScope();
      const created = await runtimeFactory({ binding, allowValidation: process.env.SOMEN_WECHAT_VALIDATION === binding.version, onEvent(event) {
        void monitor.recordEvent(event.type, { ...event, ...(typeof event.code === 'number' ? { exitCode: event.code } : {}) }, eventScope).catch(() => {});
        if (revision === runtimeRevision && ['native.worker-error', 'native.worker-exit', 'native.operation-timeout', 'native.detached',
          'native.agent-error', 'native.initialization-retained', 'native.initialization-failed',
          'native.worker-unhandled-error', 'native.worker-unhandled-rejection'].includes(event.type)) blocked = true;
      } });
      runtimeScopes.set(created, eventScope);
      if (disposed || revision !== runtimeRevision) {
        retiredRuntimes.retire(created, eventScope);
        throw noSend('工作会话已停止。', 'WORKSPACE_DISPOSED');
      }
      runtime = created;
    }
    return runtime;
  }
  function getState() {
    const state = monitor.getState();
    return {
      binding, status: state.status === 'interrupted' ? 'lost' : state.status === 'stopped' ? 'idle' : blocked ? 'error' : state.status,
      reason: state.reason || (blocked ? { code: 'NATIVE_BLOCKED', message: '原生操作已暂停。' } : null), contacts, target, lastCheckedAt: state.lastCheckedAt,
      diagnostics: { logStatus: state.logStatus, retainedRuntimeCount: retiredRuntimes.count }, lastReceipt,
      capabilities: { text: Boolean(target && runtime && runtimeCapabilities.text === true && !blocked && state.canSend), image: Boolean(target && runtime && runtimeCapabilities.image === true && !blocked && state.canSend),
        emoticon: Boolean(target && runtime && runtimeCapabilities.text === true && !blocked && state.canSend && emoticons.available(binding?.version)),
        emojiSearch: emoticons.available(binding?.version), emojiAdd: false },
    };
  }
  async function send(kind, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw noSend('发送内容无效。', 'INVALID_SEND');
    // Validate current state before preparation; perform the fresh OS identity
    // check once, immediately before native submission after durable reservation.
    requireActive();
    if (!target || !runtime) throw noSend('请先读取并绑定唯一联系人。');
    if (runtimeCapabilities[kind] !== true) throw noSend('当前版本尚未验证此发送能力。', 'CAPABILITY_UNAVAILABLE');
    if (kind === 'text' && (typeof input.content !== 'string' || !input.content.trim() || input.content.includes('\0')
      || !input.content.isWellFormed() || Buffer.byteLength(input.content, 'utf8') > 1024)) throw noSend('文字须为 1–1024 UTF-8 字节。', 'INVALID_TEXT');
    let image, reserved;
    try {
      image = kind === 'image' ? await stageImageUpload(input, join(directory, 'media')) : null;
      reserved = await journal.reserve({ requestId: input.requestId, kind,
        scope: { pid: binding.pid, startedAt: binding.startedAt, accountId: binding.accountId, target: target.id },
        payload: kind === 'text' ? input.content : image.digest });
    } catch (error) { error.outcome = 'not-sent'; throw error; }
    if (!reserved.fresh) return { ...reserved.record, status: reserved.record.status, requestId: input.requestId };
    await monitor.recordEvent('send.started', { operation: kind });
    let nativeAttempted = false;
    try {
      await active();
      nativeAttempted = true;
      const receipt = kind === 'text' ? await runtime.sendText(input) : await runtime.sendImage({ requestId: input.requestId, path: image.path });
      const status = receipt.deliveryConfirmed === true ? 'sent' : ['accepted', 'submitted'].includes(receipt.status) ? 'submitted'
        : receipt.status === 'failed' && receipt.nativeEntryCalled === false ? 'failed' : 'unknown';
      lastReceipt = { requestId: input.requestId, status, localId: receipt.localId, deliveryConfirmed: receipt.deliveryConfirmed === true };
      if (status === 'unknown') blocked = true;
      await journal.finish(input.requestId, lastReceipt);
      await monitor.recordEvent('send.completed', { operation: kind, code: status.toUpperCase() });
      return lastReceipt;
    } catch (error) {
      // A failed preflight is known not to have entered native code. Only a
      // submission attempt can produce an unknown outcome and pause this binding.
      if (nativeAttempted) blocked = true;
      lastReceipt = { requestId: input.requestId, status: nativeAttempted ? 'unknown' : 'failed', deliveryConfirmed: false };
      await journal.finish(input.requestId, lastReceipt).catch(() => {});
      await monitor.recordEvent('send.failed', { operation: kind, error });
      throw error;
    }
  }
  return {
    getState,
    select: input => exclusive(async () => {
      if (disposed) throw noSend('工作会话已停止。', 'WORKSPACE_DISPOSED');
      if (!input || !Number.isSafeInteger(input.pid) || typeof input.startedAt !== 'string') throw noSend('请选择有效微信实例。');
      const snapshot = await scan();
      if (disposed) throw noSend('工作会话已停止。', 'WORKSPACE_DISPOSED');
      const instance = snapshot.instances.find(row => row.pid === input.pid && row.startedAt === input.startedAt && row.account?.verified === true && row.role === 'main');
      if (!instance) throw noSend('微信身份已变化，请刷新列表。');
      if (binding?.pid === instance.pid && binding.startedAt === instance.startedAt && binding.accountId === instance.account.id) {
        // Selecting an existing binding is navigation, not native teardown or a send-error reset.
        if (monitor.getState().status !== 'active') await monitor.select(binding);
        return getState();
      }
      // Fence the previous runtime locally; its independent native owner may outlive this selection.
      const previous = runtime;
      pauses.remember(binding, { blocked, lastReceipt });
      runtimeRevision++;
      runtime = null; runtimeCapabilities = {}; contacts = []; target = null;
      retiredRuntimes.retire(previous, previous ? runtimeScopes.get(previous) : undefined);
      binding = { pid: instance.pid, startedAt: instance.startedAt, accountId: instance.account.id, version: instance.version, executablePath: instance.executablePath };
      ({ blocked, lastReceipt } = pauses.restore(binding));
      await monitor.select(binding);
      return getState();
    }),
    readContacts: () => exclusive(async () => {
      target = null;
      const current = await ensureRuntime();
      const result = await current.contacts();
      await active();
      contacts = individualContacts(result.contacts || [], binding.accountId);
      if (contacts.length === 1) {
        const contact = contacts[0];
        const prepared = await current.bindTarget(contact);
        runtimeCapabilities = prepared.capabilities || {};
        await active(); target = contact;
      }
      else target = null;
      await monitor.recordEvent('contacts.loaded', { count: contacts.length });
      return { ...getState(), contactsComplete: result.complete === true };
    }),
    bindTarget: input => exclusive(async () => {
      await active();
      // User authorization in this phase is limited to the sole individual contact.
      if (contacts.length !== 1 || contacts[0].id !== input.contactId) throw noSend('当前仅允许唯一联系人测试。', 'CONTACT_SCOPE');
      await (await ensureRuntime()).bindTarget(contacts[0]); target = contacts[0];
      return getState();
    }),
    sendText: input => exclusive(() => send('text', input)),
    sendImage: input => exclusive(() => send('image', input)),
    listEmoticons: query => emoticons.list(query),
    sendEmoticon: input => exclusive(() => emoticons.send(input)),
    restore: () => exclusive(async () => {
      const state = await monitor.restore();
      if (state.selected) {
        const snapshot = await scan();
        const instance = snapshot.instances.find(row => row.pid === state.selected.pid && row.startedAt === state.selected.startedAt
          && row.account?.verified === true && row.account.id === state.selected.accountId);
        binding = { ...state.selected, ...(instance ? { version: instance.version, executablePath: instance.executablePath } : {}) };
      }
      // Restored monitoring never restores a sending target or attaches automatically.
      return getState();
    }),
    async dispose() {
      if (disposed) return;
      disposed = true; runtimeRevision++;
      blocked = true;
      retiredRuntimes.retire(runtime, runtime ? runtimeScopes.get(runtime) : undefined);
      runtime = null;
      await monitor.dispose();
    },
  };
}
