import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Boundary: assemble reviewed version-local fragments; no arbitrary agent paths from HTTP input. */
const versionsRoot = fileURLToPath(new URL('../versions/', import.meta.url));
export async function versionDefinition(version) {
  if (typeof version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) throw new Error('微信版本无效。');
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(versionsRoot, version, 'manifest.json'), 'utf8')); }
  catch { throw Object.assign(new Error('当前版本暂不支持联系人与发送。'), { code: 'NATIVE_VERSION_UNSUPPORTED' }); }
  if (manifest.schemaVersion !== 1 || manifest.version !== version || manifest.architecture !== 'x64'
    || !/^[a-f0-9]{64}$/.test(manifest.dllSha256 || '') || !manifest.agents) throw new Error('微信版本适配配置无效。');
  return manifest;
}
export async function agentSource(kind, version) {
  const manifest = await versionDefinition(version);
  const files = typeof kind === 'string' && /^[a-z][a-z0-9-]*$/.test(kind) && Object.hasOwn(manifest.agents, kind) ? manifest.agents[kind] : null;
  if (!Array.isArray(files) || !files.length || files.length > 32) throw new Error('当前版本缺少原生适配器。');
  const directory = resolve(versionsRoot, version, 'agents');
  return (await Promise.all(files.map(file => {
    if (typeof file !== 'string' || !/^[a-zA-Z0-9._-]+\.js$/.test(file)) throw new Error('版本脚本路径无效。');
    const path = resolve(directory, file);
    if (!path.startsWith(`${directory}${sep}`)) throw new Error('版本脚本路径越界。');
    return readFile(path, 'utf8');
  }))).join('\n');
}
