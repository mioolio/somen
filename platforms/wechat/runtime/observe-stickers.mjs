import { fork } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Boundary: local engineering launcher; reads the already-selected work scope, never selects contacts or sends. */
const requestedPid = Number(process.argv[2]);
if (!Number.isSafeInteger(requestedPid) || requestedPid < 1) throw new Error('需要明确的目标 PID');
const port = Number(process.env.SOMEN_PORT || 5173);
const workspace = await (await fetch(`http://127.0.0.1:${port}/api/wechat/workspace`)).json();
if (workspace.binding?.pid !== requestedPid || !workspace.target?.id || workspace.binding.version !== '4.2.0.11') throw new Error('工作微信或唯一联系人尚未就绪');
const directory = fileURLToPath(new URL('../../../.local/wechat/', import.meta.url));
await mkdir(directory, { recursive: true });
const metadataPath = resolve(directory, 'sticker-observer.json');
let previous;
try { previous = JSON.parse(await readFile(metadataPath, 'utf8')); } catch { /* First observation. */ }
const retainedObserverPids = [...new Set([...(previous?.retainedObserverPids || []), previous?.observerPid].filter(Number.isSafeInteger))];
const previousObservers = [...(previous?.previousObservers || []), ...(previous?.observerPid ? [{ pid: previous.observerPid, status: previous.status, expiresAt: previous.expiresAt, errorCode: previous.errorCode }] : [])];
const child = fork(fileURLToPath(new URL('./observer-worker.mjs', import.meta.url)), [], {
  detached: true, windowsHide: true, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
});
await writeFile(metadataPath, JSON.stringify({ observerPid: child.pid, retainedObserverPids, previousObservers, targetPid: requestedPid, targetCreation: workspace.binding.startedAt, status: 'starting' }, null, 2));
await new Promise((resolveReady, reject) => {
  child.on('message', async message => {
    if (message.id !== 1) return;
    if (message.error) {
      await writeFile(metadataPath, JSON.stringify({ observerPid: child.pid, retainedObserverPids, previousObservers,
        targetPid: requestedPid, targetCreation: workspace.binding.startedAt, status: 'failed-retained', errorCode: message.error.code }, null, 2));
      reject(Object.assign(new Error(message.error.message), { code: message.error.code })); return;
    }
    await writeFile(metadataPath, JSON.stringify({ observerPid: child.pid, retainedObserverPids, previousObservers, targetPid: requestedPid,
      targetCreation: workspace.binding.startedAt, status: 'ready', readyAt: new Date().toISOString(), expiresAt: message.result.expiresAt }, null, 2));
    resolveReady();
  });
  child.on('error', reject);
  child.send({ id: 1, method: 'init', params: { binding: { identity: workspace.binding,
    targetId: workspace.target.id, output: resolve(directory, 'sticker-observation.jsonl') } } });
});
console.log(JSON.stringify({ ready: true, observerPid: child.pid, targetPid: requestedPid }));
// Keep the worker attached to Weixin, independently of this short-lived launcher.
child.disconnect(); child.unref();
