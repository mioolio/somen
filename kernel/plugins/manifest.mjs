/** Boundary: validate the public plugin contract without importing implementation code. */
export function validateManifest(manifest, directoryName) {
  if (!manifest || manifest.id !== directoryName || !/^[a-z][a-z0-9-]*$/.test(manifest.id)) {
    throw new Error('插件 id 必须与目录同名，且仅含小写字母、数字、连字符');
  }
  if (manifest.apiVersion !== 1 || typeof manifest.label !== 'string' || !manifest.label.trim()) {
    throw new Error('插件需要 apiVersion: 1 和 label');
  }
  if (manifest.path !== `/${manifest.id}`) throw new Error('插件页面路径必须为 /<id>');
  return { id: manifest.id, label: manifest.label, path: manifest.path, apiVersion: 1 };
}
