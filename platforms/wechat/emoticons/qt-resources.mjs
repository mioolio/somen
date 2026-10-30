import { inflate } from 'node:zlib';
import { promisify } from 'node:util';
import { profileRva } from './profile.mjs';

/** Boundary: bounded Qt RCC-v3 array decoding only; no Qt execution, arbitrary path extraction or disk writes. */
const decompress = promisify(inflate);
const fail = () => Object.assign(new Error('微信表情资源结构校验失败。'), { code: 'BUILTIN_EMOJI_RESOURCE_INVALID' });
export async function readQtResources(image, profile) {
  const layout = profile.rcc;
  const [tree, names, data] = await Promise.all([
    image.readRva(profileRva(layout.treeRva), layout.nodeCount * 22),
    image.readRva(profileRva(layout.nameRva), layout.nameBytes),
    image.readRva(profileRva(layout.dataRva), layout.dataBytes),
  ]);
  const files = new Map(), visited = new Set();
  function readName(offset) {
    if (offset + 6 > names.length) throw fail();
    const length = names.readUInt16BE(offset);
    if (!length || length > 260 || offset + 6 + length * 2 > names.length) throw fail();
    const name = Buffer.from(names.subarray(offset + 6, offset + 6 + length * 2)).swap16().toString('utf16le');
    if (!/^[A-Za-z0-9_ .!-]+$/.test(name) || name === '.' || name === '..') throw fail();
    return name;
  }
  async function visit(index, parent = '') {
    if (visited.has(index) || index < 0 || index >= layout.nodeCount) throw fail();
    visited.add(index);
    const at = index * 22, flags = tree.readUInt16BE(at + 4);
    const name = index === 0 ? '' : readName(tree.readUInt32BE(at));
    const path = parent ? `${parent}/${name}` : name;
    if (flags & 2) {
      const count = tree.readUInt32BE(at + 6), first = tree.readUInt32BE(at + 10);
      if (flags !== 2 || first + count > layout.nodeCount) throw fail();
      for (let child = first; child < first + count; child++) await visit(child, path);
      return;
    }
    if (![0, 1].includes(flags) || files.has(path)) throw fail();
    const offset = tree.readUInt32BE(at + 10);
    if (offset + 4 > data.length) throw fail();
    const length = data.readUInt32BE(offset);
    if (!length || length > 2 * 1024 * 1024 || offset + 4 + length > data.length) throw fail();
    let content = data.subarray(offset + 4, offset + 4 + length);
    if (flags === 1) {
      if (content.length < 5 || content.readUInt32BE(0) > 2 * 1024 * 1024) throw fail();
      const expected = content.readUInt32BE(0);
      content = await decompress(content.subarray(4), { maxOutputLength: 2 * 1024 * 1024 });
      if (content.length !== expected) throw fail();
    }
    files.set(path, content);
  }
  await visit(0);
  if (files.size !== layout.expectedFileCount || visited.size !== layout.nodeCount) throw fail();
  return files;
}
