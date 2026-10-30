/**
 * Boundary: IPC scheduling and native-owner process lifetime, independent of Frida.
 * A referenced timer is mandatory: retaining a JS variable or a Frida event listener
 * does not keep Node alive after its parent/IPC channel disappears on Windows.
 */
export function runWorkerHost({ sessionFactory }) {
  let runtime;
  let sequence = Promise.resolve();
  let unsafeFailure = false, initializing = false, retainingFailedInitialization = false;
  const methods = new Set(['contacts', 'bindTarget', 'sendText', 'sendImage', 'status', 'dispose']);
  // Deliberately referenced. Never unref this handle while native ownership exists.
  const lifetime = setInterval(() => {}, 30_000);
  const emit = message => {
    if (!process.connected) return;
    try { process.send(message, () => {}); } catch { /* Parent is gone; keep native owners alive. */ }
  };
  const exitSafe = code => { clearInterval(lifetime); process.exit(code); };
  const onEvent = event => {
    emit({ event });
    if (event.type === 'native.detached' && event.reason === 'process-terminated') setTimeout(() => exitSafe(0), 100);
  };
  const quiesce = async () => { try { await runtime?.dispose(); } catch { /* Keep resident on unknown ownership. */ } };
  // Pipe closure must not turn a parent crash into an EPIPE-driven worker exit.
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
  process.on('uncaughtException', () => {
    unsafeFailure = true; emit({ event: { type: 'native.worker-unhandled-error' } }); void quiesce();
  });
  process.on('unhandledRejection', () => {
    unsafeFailure = true; emit({ event: { type: 'native.worker-unhandled-rejection' } }); void quiesce();
  });
  process.on('message', message => {
    if (!message || typeof message.id !== 'number' || typeof message.method !== 'string') return;
    sequence = sequence.then(async () => {
      try {
        let result;
        if (message.method === 'init') {
          if (runtime || unsafeFailure) throw new Error('原生运行已初始化或已暂停。');
          initializing = true;
          try { runtime = await sessionFactory({ binding: message.params.binding,
            allowValidation: message.params.allowValidation === true, onEvent }); }
          finally { initializing = false; }
          result = await runtime.status();
        } else {
          if (!runtime || !methods.has(message.method) || (unsafeFailure && !['status', 'dispose'].includes(message.method))) throw new Error('原生运行未就绪。');
          result = await runtime[message.method](message.params);
        }
        emit({ id: message.id, result });
        if (message.method === 'dispose' && result.disposed) setTimeout(() => exitSafe(0), 50);
      } catch (error) {
        emit({ id: message.id, error: { code: error?.code || 'NATIVE_OPERATION_FAILED', message: error?.message || '微信操作未完成。' } });
        if (message.method === 'init' && error.safeToExit === false) retainingFailedInitialization = true;
        if (message.method === 'init' && !runtime && error.safeToExit !== false) setTimeout(() => exitSafe(1), 50);
      }
    });
  });
  process.on('disconnect', () => {
    if (!runtime && !initializing && !retainingFailedInitialization) exitSafe(0);
    else void quiesce();
  });
}
