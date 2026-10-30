import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Boundary: disposable test parent, explicitly terminated by the test after its stub child is ready. */
const child = fork(fileURLToPath(new URL('./resident-worker.mjs', import.meta.url)), [], {
  detached: true, windowsHide: true, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
});
child.on('message', message => {
  if (message.id === 1 && message.result?.ready) process.stdout.write(`${JSON.stringify({ workerPid: child.pid })}\n`);
});
child.send({ id: 1, method: 'init', params: { binding: {} } });
setInterval(() => {}, 30000);
