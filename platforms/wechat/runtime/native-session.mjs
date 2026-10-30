import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { requireBinding } from './binding-proof.mjs';
import { agentSource, versionDefinition } from './agent-sources.mjs';
import { readSendImage, writeNativeImage } from './image-resource.mjs';

/**
 * Boundary: one selected PID, one validated account and at most one recipient per runtime.
 * Attached scripts stay resident until the selected Weixin process exits.
 * Queue counters cannot prove that all native callback/vtable references are gone.
 * Unknown submission outcomes block further sends and are never automatically retried.
 */
export async function openNativeSession({ binding: requested, onEvent = () => {}, allowValidation = false }) {
  const binding = await requireBinding(requested, { allowValidation });
  const definition = await versionDefinition(binding.version);
  const allowed = kind => definition.nativeValidation?.[kind] === true
    || (allowValidation === true && definition.staticAbiVerified?.[kind] === true);
  if (allowValidation) onEvent({ type: 'native.validation-mode', version: binding.version,
    contacts: allowed('contacts'), text: allowed('text'), image: allowed('image') });
  const frida = await import('frida');
  const device = await frida.getLocalDevice();
  const session = await device.attach(binding.pid);
  let detached = false, blocked = false, quiesced = false, recipient = null, contactsSnapshot;
  const generation = randomUUID();
  const scripts = new Map();
  session.detached.connect((reason, crash) => {
    detached = true; blocked = true;
    onEvent({ type: 'native.detached', reason: String(reason), crashed: Boolean(crash) });
  });
  async function load(kind) {
    if (scripts.has(kind)) return scripts.get(kind);
    if (detached) throw new Error('工作微信已断开。');
    const script = await session.createScript(await agentSource(kind, binding.version), { name: `somen-${kind}` });
    script.message.connect(message => {
      if (message.type === 'error') {
        blocked = true;
        onEvent({ type: 'native.agent-error', agent: kind, lineNumber: message.lineNumber, columnNumber: message.columnNumber });
      }
    });
    scripts.set(kind, script);
    await script.load();
    return script;
  }
  async function requireLive() {
    if (detached || blocked) throw Object.assign(new Error('原生运行已停止，需重新选择工作微信。'), { code: 'NATIVE_RUNTIME_BLOCKED' });
    const current = await (await load('contacts')).exports.account();
    if (current.pid !== binding.pid || current.self !== binding.accountId || current.generation !== generation || !current.accountVerified) {
      blocked = true;
      throw Object.assign(new Error('工作微信账号已变化。'), { code: 'WORK_ACCOUNT_CHANGED' });
    }
    return current;
  }
  async function waitIdle() {
    for (let attempt = 0; attempt < 30; attempt++) {
      let idle = true;
      for (const script of scripts.values()) {
        const state = await script.exports.inspect();
        if ((state.pendingTasks || 0) || (state.pendingCallbacks || 0) || (state.retainedTasks || 0) || (state.activeReads || 0)) idle = false;
      }
      if (idle) return true;
      await delay(200);
    }
    return false;
  }
  let read;
  try {
    read = await load('contacts');
    const ready = await read.exports.prepare({ pid: binding.pid, generation, dllSha256: binding.dllSha256 });
    if (ready.self !== binding.accountId || ready.generation !== generation || !ready.accountVerified) {
      throw Object.assign(new Error('当前账号与所选工作微信不一致。'), { code: 'WORK_ACCOUNT_CHANGED' });
    }
    // Recheck the process creation time after attach, closing the PID reuse gap.
    await requireBinding(binding, { allowValidation });
  } catch (error) {
    blocked = true;
    // Even a failed initialization can have registered native function objects.
    // The observed post-unload crash forbids using task counters as teardown proof.
    error.safeToExit = false;
    onEvent({ type: 'native.initialization-retained' });
    throw error;
  }
  onEvent({ type: 'native.ready', version: binding.version });
  async function send(method, input) {
    if (!allowed(method === 'sendText' ? 'text' : 'image')) throw Object.assign(new Error('当前版本此发送能力尚未验证。'), { code: 'NATIVE_SEND_UNVERIFIED' });
    await requireLive();
    if (!recipient) throw Object.assign(new Error('尚未绑定测试联系人。'), { code: 'TEST_TARGET_REQUIRED' });
    if (!await waitIdle()) throw Object.assign(new Error('微信仍在处理上一项操作。'), { code: 'NATIVE_BUSY' });
    onEvent({ type: 'native.send-start', kind: method === 'sendText' ? 'text' : 'image', requestId: input.requestId });
    const result = await scripts.get('send').exports[method]({ ...input, to: recipient.id });
    if (result.status === 'unknown') blocked = true;
    onEvent({ type: 'native.send-result', kind: method === 'sendText' ? 'text' : 'image', requestId: input.requestId, status: result.status });
    return { ...result, deliveryConfirmed: false };
  }
  return {
    async contacts() {
      await requireLive();
      const result = await read.exports.contacts();
      if (result.pid !== binding.pid || result.self !== binding.accountId || result.generation !== generation
        || !result.cacheSnapshotComplete || !Array.isArray(result.contacts) || result.contacts.length !== result.count || result.count > 4096) {
        blocked = true;
        throw Object.assign(new Error('联系人快照未通过校验。'), { code: 'CONTACT_SNAPSHOT_INVALID' });
      }
      contactsSnapshot = result.contacts.map(row => ({ id: row.username, displayName: row.displayName, nickname: row.nickname, remark: row.remark, alias: row.alias, type: row.type }));
      onEvent({ type: 'native.contacts-read', count: contactsSnapshot.length });
      return { contacts: contactsSnapshot, complete: false, source: 'loaded-contact-cache', scannedAt: new Date().toISOString() };
    },
    async bindTarget(target) {
      await requireLive();
      if (recipient && (recipient.id !== target.id || recipient.displayName !== target.displayName)) throw new Error('本运行只允许绑定一个测试联系人。');
      if (!contactsSnapshot) throw new Error('请先读取联系人。');
      const contact = contactsSnapshot.find(row => row.id === target.id && row.displayName === target.displayName);
      if (!contact || contact.id === binding.accountId || /@chatroom$/.test(contact.id) || /^gh_/.test(contact.id)
        || ['weixin', 'newsapp', 'filehelper'].includes(contact.id)) throw new Error('测试联系人不在当前个人联系人快照中。');
      if (recipient) return { bound: true };
      if (!allowed('text') && !allowed('image')) throw Object.assign(new Error('当前版本发送适配尚未验证。'), { code: 'NATIVE_SEND_UNVERIFIED' });
      if (!await waitIdle()) throw new Error('微信读取尚未完成。');
      const sender = await load('send');
      const state = await sender.exports.prepare({ pid: binding.pid, generation, self: binding.accountId,
        chatId: contact.id, sessionId: contact.id, displayName: contact.displayName,
        validatedBinarySha256: allowed('text') || allowed('image') ? binding.dllSha256 : null,
        validatedImageBinarySha256: allowed('image') ? binding.dllSha256 : null });
      if (!state.ready || !state.accountVerified || state.self !== binding.accountId || state.chatId !== contact.id) throw new Error('发送联系人绑定校验失败。');
      recipient = { id: contact.id, displayName: contact.displayName };
      onEvent({ type: 'native.target-bound' });
      return { bound: true, capabilities: { text: allowed('text'), image: allowed('image'), sticker: false, emojiSearch: false, emojiAdd: false } };
    },
    sendText({ requestId, content }) { return send('sendText', { requestId, text: content }); },
    async sendImage({ requestId, path }) {
      if (!allowed('image')) throw Object.assign(new Error('当前版本图片发送尚未验证。'), { code: 'NATIVE_SEND_UNVERIFIED' });
      await requireLive();
      if (!recipient) throw new Error('尚未绑定测试联系人。');
      if (!await waitIdle()) throw new Error('微信仍在处理上一项操作。');
      const image = await readSendImage(path);
      const prepared = await scripts.get('send').exports.prepareImage({ to: recipient.id, imageResource: image.resource, imageSha256: image.sha256 });
      if (prepared.self !== binding.accountId || prepared.chatId !== recipient.id || prepared.imageSha256 !== image.sha256) throw new Error('微信图片资源绑定校验失败。');
      await writeNativeImage(image, prepared.cachePath);
      return send('sendImage', { requestId, imageResource: image.resource, imageSha256: image.sha256 });
    },
    async status() {
      return { ready: !detached && !blocked && !quiesced, detached, blocked, quiesced, targetBound: Boolean(recipient),
        capabilities: { contacts: allowed('contacts'), text: Boolean(recipient) && allowed('text'), image: Boolean(recipient) && allowed('image'), sticker: false, emojiSearch: false, emojiAdd: false } };
    },
    async dispose() {
      if (detached) return { disposed: true };
      // Stop business operations without unloading executable callback memory.
      // This independent worker remains alive until the selected client exits.
      quiesced = true; blocked = true;
      onEvent({ type: 'native.retained-until-client-exit' });
      return { disposed: false, retained: true, quiesced: true };
    },
  };
}
