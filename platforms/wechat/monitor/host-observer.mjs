/** Boundary: observe host failures without intercepting exceptions, changing Node exit behavior, or logging user data. */
export function observeHost({ processRef = process, logger, reference = () => null }) {
  const metadata = details => ({ ...details, sessionRef: reference() });
  const onFatal = (error, origin) => logger.recordSync('host.uncaught', metadata({ error, origin }));
  const onExit = exitCode => logger.recordSync('host.exit', metadata({ exitCode }));
  const onWarning = error => { void logger.record('host.warning', metadata({ error })); };
  processRef.on('uncaughtExceptionMonitor', onFatal);
  processRef.on('exit', onExit);
  processRef.on('warning', onWarning);
  return () => {
    processRef.off('uncaughtExceptionMonitor', onFatal);
    processRef.off('exit', onExit);
    processRef.off('warning', onWarning);
  };
}
