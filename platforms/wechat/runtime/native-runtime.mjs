import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Boundary: asynchronous private worker transport. Contacts/recipient identifiers
 * travel only through IPC responses; diagnostic events never include message content.
 * A timeout never retries or kills a worker that may still own native callbacks.
 */
export async function createNativeRuntime({ binding, onEvent = () => {}, allowValidation = false, timeoutMs = 25000, forkImpl = fork }) {
  const child = forkImpl(fileURLToPath(new URL('./worker.mjs', import.meta.url)), [], {
    windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json', execArgv: [],
  });
  const pending = new Map();
  let nextId = 0, stopped = false, blocked = false, targetTerminated = false, retirement;
  const emit = event => { try { onEvent(event); } catch { /* Diagnostics cannot interrupt native work. */ } };
  // Never forward arbitrary dependency output: it could contain identifiers.
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => emit({ type: 'native.worker-stderr' }));
  child.on('message', message => {
    if (message.event) {
      if (message.event.type === 'native.detached' && message.event.reason === 'process-terminated') targetTerminated = true;
      emit(message.event); return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(Object.assign(new Error(message.error.message), { code: message.error.code }));
    else request.resolve(message.result);
  });
  function failPending(error) {
    blocked = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
  child.on('error', error => {
    emit({ type: 'native.worker-error', code: error.code || 'WORKER_ERROR' });
    failPending(Object.assign(new Error('微信原生工作进程无法启动。'), { code: 'NATIVE_WORKER_FAILED' }));
  });
  child.on('exit', (code, signal) => {
    stopped = true;
    emit({ type: 'native.worker-exit', code, signal });
    failPending(Object.assign(new Error('微信原生工作进程已退出。'), { code: 'NATIVE_WORKER_EXITED' }));
  });
  function call(method, params = {}) {
    if (stopped || !child.connected || (blocked && !['status', 'dispose'].includes(method))) return Promise.reject(Object.assign(new Error('微信原生运行不可用。'), { code: 'NATIVE_RUNTIME_BLOCKED' }));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id); blocked = true;
        emit({ type: 'native.operation-timeout', operation: method });
        reject(Object.assign(new Error('微信操作超时，结果未确认，请勿重复发送。'), { code: 'NATIVE_OPERATION_UNKNOWN' }));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, method, params }, error => {
        if (!error) return;
        clearTimeout(timer); pending.delete(id);
        reject(Object.assign(new Error('微信工作进程连接中断。'), { code: 'NATIVE_IPC_FAILED' }));
      });
    });
  }
  try { await call('init', { binding, allowValidation: allowValidation === true }); }
  catch (error) {
    emit({ type: 'native.initialization-failed', code: error.code || 'NATIVE_INIT_FAILED' });
    // An initialization timeout can also leave queued callbacks. Never terminate it.
    child.unref();
    child.channel?.unref();
    throw error;
  }
  return {
    contacts: () => call('contacts'),
    bindTarget: target => call('bindTarget', target),
    sendText: input => call('sendText', input),
    sendImage: input => call('sendImage', input),
    status: async () => ({ ...await call('status'), transportBlocked: blocked }),
    dispose() {
      // The caller's lease ends synchronously, independent of the worker's code
      // version or IPC acknowledgement. Retained callback owners do not imply
      // that this business interface may continue sending.
      blocked = true;
      if (retirement) return retirement;
      retirement = (async () => {
        try {
          if (stopped || !child.connected) return { disposed: targetTerminated, retained: !targetTerminated,
            quiesced: true, remoteAcknowledged: false, code: 'NATIVE_WORKER_DISCONNECTED' };
          const result = await call('dispose');
          // Legacy workers can return retained without quiesced, or report a
          // generic detach as disposed. Only target termination proves release.
          return { ...result, disposed: targetTerminated && result?.disposed === true,
            retained: !(targetTerminated && result?.disposed === true), quiesced: true, remoteAcknowledged: true };
        } catch (error) {
          emit({ type: 'native.retirement-unconfirmed', code: error?.code || 'NATIVE_IPC_FAILED' });
          return { disposed: false, retained: true, quiesced: true, remoteAcknowledged: false,
            code: error?.code || 'NATIVE_IPC_FAILED' };
        } finally {
          try { child.unref(); child.channel?.unref(); } catch { /* The worker may already have exited. */ }
          if (!targetTerminated) emit({ type: 'native.worker-retained' });
        }
      })();
      return retirement;
    },
  };
}
