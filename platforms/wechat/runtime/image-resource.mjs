import { open, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateImageBytes } from './validate-image.mjs';

/** Boundary: bounded immutable local image bytes and exclusive writes to a native-issued cache entry. */
export async function readSendImage(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || /^(?:[a-z]+:\/\/|\\\\|\/\/)/i.test(path) || path.includes('\0')) throw new Error('图片需要本机绝对路径。');
  const handle = await open(resolve(path), 'r');
  let bytes;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 25 * 1024 * 1024) throw new Error('图片大小需要为 1 字节至 25 MiB。');
    bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset !== stat.size) throw new Error('图片在读取期间发生变化。');
    bytes = bytes.subarray(0, offset);
  } finally { await handle.close(); }
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const gif = bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  const webp = bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  const bmp = bytes.length >= 26 && bytes.toString('ascii', 0, 2) === 'BM';
  if (!png && !jpg && !gif && !webp && !bmp) throw new Error('图片格式暂不支持。');
  await validateImageBytes(bytes);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), resource: `wxcc-image-${randomUUID()}` };
}
export async function writeNativeImage(image, path) {
  if (typeof path !== 'string' || !/^[A-Za-z]:[\\/].*[\\/]HttpResource[\\/][a-f0-9]{32,64}$/i.test(path)
    || path.includes('\0') || path.split(/[\\/]/).includes('..')) throw new Error('微信图片缓存路径校验失败。');
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(image.bytes); await handle.sync(); }
  finally { await handle.close(); }
}
