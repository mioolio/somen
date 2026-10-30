import { runWorkerHost } from '../../worker-host.mjs';

/** Boundary: disposable no-Frida worker fixture; target termination timer is intentionally unreferenced. */
runWorkerHost({ sessionFactory: async ({ onEvent }) => {
  // The parent owns these pipe readers and will be killed before this write.
  // EPIPE must not destroy the independent native-owner process.
  const pipeProbe = setTimeout(() => { process.stdout.write('fixture diagnostic\n'); process.stderr.write('fixture diagnostic\n'); }, 200);
  pipeProbe.unref();
  const termination = setTimeout(() => onEvent({ type: 'native.detached', reason: 'process-terminated' }), 1800);
  termination.unref();
  return {
    status: async () => ({ ready: true }),
    dispose: async () => ({ disposed: false, retained: true, quiesced: true }),
  };
} });
