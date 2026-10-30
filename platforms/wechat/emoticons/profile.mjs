import { readFile } from 'node:fs/promises';

/** Boundary: load one installed-version resource layout; the owning version manifest pins its DLL fingerprint. */
export async function loadEmojiProfile(version) {
  if (typeof version !== 'string' || !/^\d{1,4}(?:\.\d{1,4}){3}$/.test(version)) throw unsupported();
  try {
    const base = new URL(`../versions/${version}/`, import.meta.url);
    const [profile, manifest] = await Promise.all(['emoji-resources.json', 'manifest.json']
      .map(async file => JSON.parse(await readFile(new URL(file, base), 'utf8'))));
    if (profile.schemaVersion !== 1 || profile.version !== version || manifest.version !== version
      || profile.reader !== 'qt-rcc-v3-builtin-emoji-v1'
      || !/^[a-f0-9]{64}$/.test(manifest.dllSha256) || profile.dllSha256 !== manifest.dllSha256
      || profile.rcc?.version !== 3 || profile.rcc.nodeCount > 1000 || profile.rcc.nameBytes > 1024 * 1024
      || profile.rcc.dataBytes > 4 * 1024 * 1024 || profile.legacy?.count > 256
      || profile.expectedPanelCount > 256 || profile.legacy.imageIndexBase !== 1
      || profile.legacy.imagePattern !== 'expression_{index}.png') throw unsupported();
    return profile;
  } catch (error) { if (error.code === 'BUILTIN_EMOJI_UNSUPPORTED') throw error; throw unsupported(); }
}
export function unsupported() {
  return Object.assign(new Error('当前微信版本暂不支持内置表情目录。'), { code: 'BUILTIN_EMOJI_UNSUPPORTED' });
}
export function profileRva(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,8}$/i.test(value)) throw unsupported();
  return Number(value);
}
