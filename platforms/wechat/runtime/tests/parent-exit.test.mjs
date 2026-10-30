import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

/** Boundary: real process regression for parent termination, IPC loss and callback-owner lifetime. No WeChat or Frida. */
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
test('native-owner stub survives its parent being killed and exits only after target termination', { timeout: 7000 }, async t => {
  const parent = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/resident-parent.mjs', import.meta.url))], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let workerPid;
  t.after(() => {
    if (alive(parent.pid)) parent.kill();
    if (workerPid && alive(workerPid)) process.kill(workerPid);
  });
  workerPid = await new Promise((resolve, reject) => {
    let text = '';
    parent.stdout.on('data', bytes => {
      text += bytes.toString();
      if (text.includes('\n')) resolve(JSON.parse(text.split('\n')[0]).workerPid);
    });
    parent.on('error', reject);
    parent.on('exit', () => { if (!workerPid && !text.includes('\n')) reject(new Error('Fixture parent exited before worker ready')); });
  });
  assert.equal(alive(workerPid), true);
  const exited = once(parent, 'exit');
  parent.kill();
  await exited;
  await delay(300);
  assert.equal(alive(workerPid), true, 'IPC disconnect must not release native callback memory');
  for (let attempt = 0; attempt < 60 && alive(workerPid); attempt++) await delay(50);
  assert.equal(alive(workerPid), false, 'target process termination is the safe owner-release boundary');
});
