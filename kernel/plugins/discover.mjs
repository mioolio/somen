import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from './manifest.mjs';

/**
 * Boundary: directory discovery, namespace ownership, and lifecycle only.
 * Each plugin is installed atomically; a failed registration rolls back its routes.
 * Removal/addition takes effect on the next host restart; no central allowlist exists.
 */
export async function discoverPlugins({ directory, router, importer = url => import(url), loadTimeoutMs = 5000 }) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { platforms: [], dispose: async () => {} }; throw error; }
  const platforms = [];
  const disposers = [];
  for (const entry of entries.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const pluginDirectory = join(directory, entry.name);
    let raw;
    try { raw = JSON.parse(await readFile(join(pluginDirectory, 'manifest.json'), 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') console.warn(`[插件 ${entry.name}] manifest.json 无效`);
      continue;
    }
    let manifest;
    let namespace;
    let registrationClosed = false;
    const cleanups = [];
    let timer;
    try {
      manifest = validateManifest(raw, entry.name);
      if (raw.enabled === false) continue;
      namespace = router.namespace(`/api/${manifest.id}`);
      const installation = (async () => {
        const plugin = await importer(pathToFileURL(join(pluginDirectory, 'server', 'register.mjs')).href);
        if (registrationClosed) return;
        if (typeof plugin.register !== 'function') throw new Error('缺少 register 导出');
        await plugin.register(Object.freeze({
          router: namespace,
          onDispose(cleanup) {
            if (typeof cleanup !== 'function') throw new TypeError('cleanup 必须为函数');
            if (registrationClosed) {
              // A timed-out asynchronous registration may finish later; release late resources too.
              Promise.resolve().then(cleanup).catch(() => {});
            } else cleanups.push(cleanup);
          },
        }));
      })();
      await Promise.race([installation, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('插件加载超过时间限制')), loadTimeoutMs);
      })]);
      clearTimeout(timer);
      platforms.push({ ...manifest, status: 'ready' });
      disposers.push(async () => {
        registrationClosed = true;
        namespace.dispose();
        await Promise.allSettled(cleanups.map(cleanup => Promise.resolve().then(cleanup)));
      });
    } catch (error) {
      clearTimeout(timer);
      registrationClosed = true;
      namespace?.dispose();
      await Promise.allSettled(cleanups.map(cleanup => Promise.resolve().then(cleanup)));
      console.warn(`[插件 ${entry.name}] ${error?.message || '加载失败'}`);
      if (manifest) platforms.push({ ...manifest, status: 'error', error: '插件加载失败，请查看开发终端。' });
    }
  }
  return {
    platforms,
    async dispose() { await Promise.allSettled(disposers.reverse().map(dispose => dispose())); },
  };
}
