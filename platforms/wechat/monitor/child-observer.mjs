/** Boundary: record native child lifecycle. Unexpected failure revokes the active workspace; normal request completion does not. */
export function observeChild({ child, logger, reference, interrupt, operation = 'native' }) {
  if (!child || typeof child.on !== 'function' || typeof child.off !== 'function') throw new TypeError('A child process event source is required.');
  const metadata = details => ({ ...details, operation, sessionRef: reference() });
  const onError = error => {
    void logger.record('child.error', metadata({ pid: child.pid, error }));
    interrupt({ code: 'WORKSPACE_RUNTIME_ERROR', message: '微信运行组件异常，请重新选择工作微信。' });
  };
  const onExit = (exitCode, signal) => {
    void logger.record('child.exit', metadata({ pid: child.pid, exitCode, signal }));
    if (exitCode !== 0 || signal) interrupt({ code: 'WORKSPACE_RUNTIME_EXITED', message: '微信运行组件已退出，请重新选择工作微信。' });
  };
  child.on('error', onError);
  child.on('exit', onExit);
  return () => { child.off('error', onError); child.off('exit', onExit); };
}
