import { appendFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { agentSource } from './agent-sources.mjs';
import { requireBinding } from './binding-proof.mjs';
import { retainNativeOwner } from './resident-owner.mjs';
import { createTargetLifetime } from './target-lifetime.mjs';

const residentOwners = new Set();

/** Boundary: additional read-only observer session; callback memory is retained through target process exit. */
export async function openObserverSession({ binding, targetId, output, durationMs = 30 * 60 * 1000, onEvent = () => {} }) {
  const proof = await requireBinding(binding);
  const frida = await import('frida');
  const session = await (await frida.getLocalDevice()).attach(binding.pid);
  const owner = retainNativeOwner(residentOwners, session);
  const targetLifetime = createTargetLifetime();
  try {
    let detached = false;
    session.detached.connect((reason, crash) => {
      detached = true;
      targetLifetime.observeDetached(String(reason));
      onEvent({ type: 'native.detached', reason: String(reason), crashed: Boolean(crash) });
    });
    const script = await session.createScript(await agentSource('sticker-observer', binding.version), { name: 'somen-sticker-observer' });
    owner.scripts.add(script);
    let writes = Promise.resolve();
    const record = event => { writes = writes.then(() => appendFile(output, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`)).catch(() => {}); };
    script.message.connect(message => {
      if (message.type === 'send') record(message.payload);
      else if (message.type === 'error') record({ type: 'sticker-observer.script-error', lineNumber: message.lineNumber, columnNumber: message.columnNumber });
    });
    await script.load();
    // Hook addresses come only from the reviewed per-version catalog, never from
    // operator control data or HTTP. A control file can select catalog names only.
    const catalogPath = new URL(`../versions/${binding.version}/observer-hooks.json`, import.meta.url);
    const readCatalog = async () => JSON.parse(await readFile(catalogPath, 'utf8'));
    const ready = await script.exports.start({ ...binding, targetId, durationMs,
      catalog: await readCatalog(), dllSha256: proof.dllSha256 });
    await requireBinding(binding);
    record({ type: 'sticker-observer.ready', functions: ready.functions, expiresAt: ready.expiresAt });
    await writes;
    let controlRevision, polling = false;
    const controlPath = join(dirname(output), 'sticker-observer-control.json');
    const controlTimer = setInterval(async () => {
      if (detached || polling) return;
      polling = true;
      try {
        const control = JSON.parse(await readFile(controlPath, 'utf8'));
        if (typeof control.revision !== 'string' || control.revision === controlRevision) return;
        const armed = await script.exports.arm({ durationMs: control.durationMs, hooks: control.hooks, catalog: await readCatalog() });
        controlRevision = control.revision;
        record({ type: 'sticker-observer.armed', expiresAt: armed.expiresAt, hooks: armed.hooks });
      } catch { /* Missing or invalid local control data does not alter the active scope. */ }
      finally { polling = false; }
    }, 5000);
    controlTimer.unref(); // worker-host owns the mandatory referenced lifetime timer.
    session.detached.connect(() => clearInterval(controlTimer));
    return {
      status: async () => ({ ready: !detached && ready.ready, observerPid: process.pid, expiresAt: ready.expiresAt }),
      dispose: async () => targetLifetime.disposalProof(),
    };
  } catch (error) { error.safeToExit = false; throw error; }
}
