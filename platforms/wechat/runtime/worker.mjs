import { openNativeSession } from './native-session.mjs';

/** Boundary: private IPC worker owns one persistent Frida session; no HTTP or terminal interface. */
let runtime;
let sequence = Promise.resolve();
const methods = new Set(['contacts', 'bindTarget', 'sendText', 'sendImage', 'status', 'dispose']);
function emit(message) { if (process.connected) process.send(message); }
process.on('message', message => {
  if (!message || typeof message.id !== 'number' || typeof message.method !== 'string') return;
  sequence = sequence.then(async () => {
    try {
      let result;
      if (message.method === 'init') {
        if (runtime) throw new Error('原生运行已初始化。');
        runtime = await openNativeSession({ binding: message.params.binding, allowValidation: message.params.allowValidation === true, onEvent: event => {
          emit({ event });
          // No callback can run after the target process itself has terminated.
          if (event.type === 'native.detached' && event.reason === 'process-terminated') setTimeout(() => process.exit(0), 100);
        } });
        result = await runtime.status();
      } else {
        if (!runtime || !methods.has(message.method)) throw new Error('原生运行未就绪。');
        result = await runtime[message.method](message.params);
      }
      emit({ id: message.id, result });
      if (message.method === 'dispose' && result.disposed) setTimeout(() => process.exit(0), 50);
    } catch (error) {
      emit({ id: message.id, error: { code: error?.code || 'NATIVE_OPERATION_FAILED', message: error?.message || '微信操作未完成。' } });
      if (message.method === 'init' && error.safeToExit !== false) setTimeout(() => process.exit(1), 50);
    }
  });
});
// Parent disappearance is not permission to unload executable callback memory.
// The independent process stays alive until Weixin itself has terminated.
process.on('disconnect', async () => {
  if (!runtime) return;
  try { await runtime.dispose(); }
  catch { /* Retain native callback ownership until the selected client exits. */ }
});
