import { loadEmojiProfile } from './profile.mjs';
import { locateInstalledDll, openVerifiedImage } from './installed-dll.mjs';
import { readQtResources } from './qt-resources.mjs';
import { buildCatalogItems } from './catalog-items.mjs';
import { searchCatalog } from './search-catalog.mjs';

/**
 * Boundary: cached read-only catalog from one verified installation. Never accepts browser-provided file paths.
 * Built-in emoji are text tokens (type 1); this module does not implement or claim type-47 sticker sending.
 */
const cache = new Map();
const source = 'installed-wechat-resources';
async function loadItems(installation, profile) {
  const image = await openVerifiedImage(installation, profile.dllSha256);
  try {
    const resources = await readQtResources(image, profile);
    const items = await buildCatalogItems(image, profile, resources);
    await image.assertUnchanged();
    return items;
  } finally { await image.close(); }
}
export async function createBuiltinCatalog({ version, executablePath }) {
  const profile = await loadEmojiProfile(version);
  const installation = await locateInstalledDll({ version, executablePath });
  const key = `${installation.key}:${profile.dllSha256}`;
  let pending = cache.get(key);
  if (!pending) {
    if (cache.size >= 2) cache.clear();
    pending = loadItems(installation, profile).catch(error => { cache.delete(key); throw error; });
    cache.set(key, pending);
  }
  const items = await pending;
  return {
    version, complete: true, source,
    list(query = '') {
      return { items: searchCatalog(items, query), complete: true, source, total: items.length };
    },
  };
}
export async function readBuiltinCatalog({ binding, query = '' }) {
  const catalog = await createBuiltinCatalog(binding);
  return catalog.list(query);
}
