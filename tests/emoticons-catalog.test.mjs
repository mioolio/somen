import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogItems } from '../platforms/wechat/emoticons/catalog-items.mjs';
import { searchCatalog } from '../platforms/wechat/emoticons/search-catalog.mjs';
import { loadEmojiProfile } from '../platforms/wechat/emoticons/profile.mjs';
import { locateInstalledDll } from '../platforms/wechat/emoticons/installed-dll.mjs';

/** Boundary: prove exact token/name/image mapping and local search without requiring installed or private assets. */
function fixture() {
  const imageBase = 0x180000000n;
  const strings = new Map([[0x500, '/::)'], [0x600, '[微笑]'], [0x700, '[Smile]']]);
  const pointers = new Map([[0x100, 0x500], [0x200, 0x600], [0x300, 0x700]]);
  const image = { imageBase, async readRva(rva, length) {
    const data = Buffer.alloc(length);
    if (pointers.has(rva)) data.writeBigUInt64LE(imageBase + BigInt(pointers.get(rva)));
    else data.write(strings.get(rva), 'utf8');
    return data;
  } };
  const profile = { legacy: { count: 1, tokenPointersRva: '0x100', chinesePointersRva: '0x200', englishPointersRva: '0x300' },
    newEmojiResource: 'emoji/new.xml', panelResource: 'emoji/panel.xml', expectedNewEmojiCount: 1, expectedPanelCount: 2 };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9f8AAAAASUVORK5CYII=', 'base64');
  const resources = new Map([
    ['emoji/panel.xml', Buffer.from('<emoji-panel><item><![CDATA[[Facepalm]]]></item><item><![CDATA[/::)]]></item></emoji-panel>')],
    ['emoji/new.xml', Buffer.from('<newemoji><emoji><key><![CDATA[[Facepalm]]]></key><cn-value><![CDATA[[捂脸]]]></cn-value><en-value><![CDATA[[Facepalm]]]></en-value><fileName>face.png</fileName></emoji></newemoji>')],
    ['emoji/face.png', png], ['emoji/expression_1.png', png],
  ]);
  return { image, profile, resources };
}
test('panel order and legacy index+1/new XML filenames determine the exact displayed item', async () => {
  const { image, profile, resources } = fixture();
  const items = await buildCatalogItems(image, profile, resources);
  assert.deepEqual(items.map(({ title, token }) => ({ title, token })), [
    { title: '捂脸', token: '[Facepalm]' }, { title: '微笑', token: '/::)' },
  ]);
  assert.equal(searchCatalog(items, '微笑')[0].token, '/::)');
  assert.equal(searchCatalog(items, 'FACEPALM')[0].title, '捂脸');
  assert.equal(searchCatalog(items, '/::)')[0].title, '微笑');
  assert.deepEqual(searchCatalog(items, 'not-found'), []);
  const copy = searchCatalog(items);
  copy[0].title = 'changed';
  assert.equal(items[0].title, '捂脸');
});
test('an unmapped panel token or missing installed image is an error, never a guessed entry', async () => {
  const { image, profile, resources } = fixture();
  resources.delete('emoji/expression_1.png');
  await assert.rejects(buildCatalogItems(image, profile, resources), { code: 'BUILTIN_EMOJI_CATALOG_INVALID' });
});
test('unsupported versions and caller-supplied arbitrary paths are rejected before reading resources', async () => {
  await assert.rejects(loadEmojiProfile('4.2.0.7'), { code: 'BUILTIN_EMOJI_UNSUPPORTED' });
  await assert.rejects(loadEmojiProfile('../4.2.0.11'), { code: 'BUILTIN_EMOJI_UNSUPPORTED' });
  for (const executablePath of ['C:\\private\\secret.json', '\\\\server\\share\\Weixin.exe']) {
    await assert.rejects(locateInstalledDll({ version: '4.2.0.11', executablePath }), { code: 'BUILTIN_EMOJI_INSTALLATION_INVALID' });
  }
});
