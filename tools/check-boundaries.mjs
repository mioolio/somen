import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Boundary: enforce source size, root hygiene, and platform dependency direction; no compilation. */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const excluded = new Set(['.git', 'node_modules', '.local', 'dist', 'coverage']);
const sourceExtensions = new Set(['.mjs', '.js', '.vue', '.css', '.ps1', '.cs', '.html']);
const failures = [];
const top = await readdir(root, { withFileTypes: true });
const rootFiles = top.filter(item => item.isFile() && extname(item.name) !== '.md');
if (rootFiles.length > 4) failures.push(`主目录有 ${rootFiles.length} 个非 Markdown 文件，最多 4 个`);
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await visit(path); continue; }
    if (!sourceExtensions.has(extname(path))) continue;
    const source = await readFile(path, 'utf8');
    const name = relative(root, path).replaceAll('\\', '/');
    const lines = source.split(/\r?\n/).length;
    if (lines > 2000) failures.push(`${name}: ${lines} 行，超过 2000 行`);
    if (!/Boundary|边界/.test(source)) failures.push(`${name}: 缺少文件职责边界注释`);
    // Resolve literal imports, re-exports and side-effect imports before testing ownership.
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) continue;
      const target = relative(root, resolve(dirname(path), match[1])).replaceAll('\\', '/');
      if (name.startsWith('kernel/') && target.startsWith('platforms/')) failures.push(`${name}: 内核不能引用平台实现`);
      if (!name.startsWith('platforms/')) continue;
      const id = name.split('/')[1];
      if (target.startsWith('kernel/') || target.startsWith('apps/')) failures.push(`${name}: 平台不应反向依赖宿主`);
      if (target.startsWith('platforms/') && target.split('/')[1] !== id) failures.push(`${name}: 平台不能互相依赖`);
    }
  }
}
await visit(root);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`边界检查通过：主目录 ${rootFiles.length}/4 个非 Markdown 文件；源文件均 ≤2000 行。`);
