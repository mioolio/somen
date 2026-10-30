import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readQtResources } from '../platforms/wechat/emoticons/qt-resources.mjs';

/** Boundary: reject malformed Qt tree/path/payload layouts and decompression bounds using synthetic resources. */
function fixture({ name = 'test.xml', expectedBytes = 2 } = {}) {
  const encoded = Buffer.from(name, 'utf16le').swap16();
  const names = Buffer.alloc(encoded.length + 6); names.writeUInt16BE(name.length); encoded.copy(names, 6);
  const payload = deflateSync(Buffer.from('ok'));
  const data = Buffer.alloc(payload.length + 8); data.writeUInt32BE(payload.length + 4); data.writeUInt32BE(expectedBytes, 4); payload.copy(data, 8);
  const tree = Buffer.alloc(44); tree.writeUInt16BE(2, 4); tree.writeUInt32BE(1, 6); tree.writeUInt32BE(1, 10);
  tree.writeUInt16BE(1, 26);
  const buffers = new Map([[0x100, tree], [0x200, names], [0x300, data]]);
  return { tree, image: { readRva: async rva => buffers.get(rva) }, profile: { rcc: {
    treeRva: '0x100', nodeCount: 2, nameRva: '0x200', nameBytes: names.length,
    dataRva: '0x300', dataBytes: data.length, expectedFileCount: 1,
  } } };
}
test('Qt qCompress resources decode within their declared output bound', async () => {
  const { image, profile } = fixture();
  assert.equal((await readQtResources(image, profile)).get('test.xml').toString(), 'ok');
});
test('path traversal names, cycles and oversized expansion claims fail closed', async () => {
  for (const options of [{ name: '..' }, { expectedBytes: 10 * 1024 * 1024 }]) {
    const { image, profile } = fixture(options);
    await assert.rejects(readQtResources(image, profile), { code: 'BUILTIN_EMOJI_RESOURCE_INVALID' });
  }
  const { tree, image, profile } = fixture();
  tree.writeUInt32BE(0, 10);
  await assert.rejects(readQtResources(image, profile), { code: 'BUILTIN_EMOJI_RESOURCE_INVALID' });
});
