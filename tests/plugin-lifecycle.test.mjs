import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHost } from '../kernel/host.mjs';
import { createRouter } from '../kernel/http/router.mjs';
import { discoverPlugins } from '../kernel/plugins/discover.mjs';

/** Boundary: exercise plugin installation, failure rollback, removal/restoration using temporary plugins. */
async function request(host, path) {
  let status, body;
  const response = {
    writeHead(code) { status = code; },
    end(text) { body = JSON.parse(text); },
  };
  await host.dispatch({ url: path, method: 'GET' }, response);
  return { status, body };
}
async function fixture(t, id, source) {
  const base = await mkdtemp(join(tmpdir(), 'somen-plugin-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const directory = join(base, 'platforms');
  const plugin = join(directory, id);
  await mkdir(join(plugin, 'server'), { recursive: true });
  await writeFile(join(plugin, 'manifest.json'), JSON.stringify({ id, label: id, path: `/${id}`, apiVersion: 1 }));
  await writeFile(join(plugin, 'server', 'register.mjs'), source);
  return { base, directory, plugin };
}
test('a platform can be removed and restored without changing the host', async t => {
  const { directory, plugin, base } = await fixture(t, 'sample', `
    export function register({router}) { router.get('/instances', () => ({instances:[{pid:123}]})); }
  `);
  let host = await createHost({ platformsDirectory: directory });
  assert.equal((await request(host, '/api/sample/instances')).body.instances[0].pid, 123);
  await host.dispose();
  await rename(plugin, join(base, 'detached'));
  host = await createHost({ platformsDirectory: directory });
  assert.deepEqual((await request(host, '/api/platforms')).body.platforms, []);
  assert.equal((await request(host, '/api/sample/instances')).status, 404);
  await host.dispose();
  await rename(join(base, 'detached'), plugin);
  host = await createHost({ platformsDirectory: directory });
  assert.equal((await request(host, '/api/sample/instances')).status, 200);
  await host.dispose();
});
test('failed registration rolls back routes and invokes cleanup, other plugins still load', async t => {
  const { directory } = await fixture(t, 'broken', '');
  await mkdir(join(directory, 'healthy'));
  await writeFile(join(directory, 'healthy', 'manifest.json'), JSON.stringify({ id: 'healthy', label: 'healthy', path: '/healthy', apiVersion: 1 }));
  let cleaned = false;
  const router = createRouter();
  const plugins = await discoverPlugins({ directory, router, importer: async url => ({
    register({ router: namespace, onDispose }) {
      namespace.get('/check', () => ({ ok: true }));
      if (url.includes('/broken/')) {
        onDispose(() => { cleaned = true; });
        throw new Error('fixture failure');
      }
    },
  }) });
  assert.equal(cleaned, true);
  assert.deepEqual(plugins.platforms.map(item => item.status), ['error', 'ready']);
  assert.equal((await request(router, '/api/broken/check')).status, 404);
  assert.equal((await request(router, '/api/healthy/check')).status, 200);
  await plugins.dispose();
  assert.equal((await request(router, '/api/healthy/check')).status, 404);
});
test('a disabled plugin is never imported', async t => {
  const { directory, plugin } = await fixture(t, 'disabled', 'throw new Error("must not import")');
  await writeFile(join(plugin, 'manifest.json'), JSON.stringify({ id: 'disabled', label: 'disabled', path: '/disabled', apiVersion: 1, enabled: false }));
  const host = await createHost({ platformsDirectory: directory });
  assert.deepEqual((await request(host, '/api/platforms')).body.platforms, []);
  await host.dispose();
});
test('a stalled registration times out, rolls back routes, and releases late resources', async t => {
  const { directory } = await fixture(t, 'stalled', '');
  const router = createRouter();
  let finish, lateContext, cleaned = false;
  const plugins = await discoverPlugins({ directory, router, loadTimeoutMs: 20, importer: async () => ({
    register(context) {
      lateContext = context;
      context.router.get('/partial', () => ({}));
      return new Promise(resolve => { finish = resolve; });
    },
  }) });
  assert.equal(plugins.platforms[0].status, 'error');
  assert.equal((await request(router, '/api/stalled/partial')).status, 404);
  assert.throws(() => lateContext.router.get('/late', () => ({})));
  lateContext.onDispose(() => { cleaned = true; });
  await Promise.resolve();
  assert.equal(cleaned, true);
  finish();
  await plugins.dispose();
});
