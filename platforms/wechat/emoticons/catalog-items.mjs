import { profileRva } from './profile.mjs';

/** Boundary: map exact panel tokens to verified client-owned title tables and PNGs; missing mappings fail instead of guessing. */
const fail = () => Object.assign(new Error('微信表情目录不完整。'), { code: 'BUILTIN_EMOJI_CATALOG_INVALID' });
const plainTitle = text => text.replace(/^\[|\]$/g, '');
function xmlText(buffer) { if (!buffer || buffer.length > 128 * 1024) throw fail(); return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
function field(block, name) {
  const match = block.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${name}>`));
  if (!match) throw fail();
  return (match[1] ?? match[2]).trim();
}
async function legacyItems(image, profile) {
  const layout = profile.legacy, count = layout.count;
  const tables = await Promise.all([layout.tokenPointersRva, layout.chinesePointersRva, layout.englishPointersRva]
    .map(rva => image.readRva(profileRva(rva), count * 8)));
  async function text(table, index) {
    const pointer = table.readBigUInt64LE(index * 8);
    const delta = pointer - image.imageBase;
    if (delta < 0n || delta > 0x7fffffffn) throw fail();
    const data = await image.readRva(Number(delta), 256);
    const end = data.indexOf(0);
    if (end < 1) throw fail();
    return new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, end));
  }
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    const [token, chinese, english] = await Promise.all(tables.map(table => text(table, index)));
    if (!token.startsWith('/') || entries.has(token) || !chinese.startsWith('[') || !english.startsWith('[')) throw fail();
    entries.set(token, { title: plainTitle(chinese), english: plainTitle(english), file: `expression_${index + 1}.png` });
  }
  return entries;
}
export async function buildCatalogItems(image, profile, resources) {
  const legacy = await legacyItems(image, profile);
  const newXml = xmlText(resources.get(profile.newEmojiResource));
  const additions = [...newXml.matchAll(/<emoji>\s*([\s\S]*?)<\/emoji>/g)].map(match => match[1]);
  if (additions.length !== profile.expectedNewEmojiCount) throw fail();
  const newItems = new Map(additions.map(block => [field(block, 'key'), {
    title: plainTitle(field(block, 'cn-value')), english: plainTitle(field(block, 'en-value')), file: field(block, 'fileName'),
  }]));
  const panelXml = xmlText(resources.get(profile.panelResource));
  const tokens = [...panelXml.matchAll(/<item>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/item>/g)].map(match => match[1]);
  if (tokens.length !== profile.expectedPanelCount || new Set(tokens).size !== tokens.length) throw fail();
  return tokens.map((token, index) => {
    const mapping = newItems.get(token) || legacy.get(token);
    const png = mapping && resources.get(`emoji/${mapping.file}`);
    if (!mapping || !png || png.length < 24 || png.length > 2 * 1024 * 1024
      || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || png.readUInt32BE(16) > 1024 || png.readUInt32BE(20) > 1024) throw fail();
    return Object.freeze({ id: `builtin:${index}`, title: mapping.title, english: mapping.english,
      kind: 'emoji', token, previewUrl: `data:image/png;base64,${png.toString('base64')}` });
  });
}
