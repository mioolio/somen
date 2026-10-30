import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateImageBytes } from '../runtime/validate-image.mjs';

/** Boundary: bounded browser image uploads become immutable local media; filenames never become paths. */
export async function stageImageUpload({ dataUrl }, directory) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 17 * 1024 * 1024) throw new Error('图片大小上限为 12 MiB。');
  const match = dataUrl.match(/^data:image\/(png|jpeg|gif|webp|bmp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('请选择 PNG、JPEG、GIF、WebP 或 BMP 图片。');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error('图片大小上限为 12 MiB。');
  let format;
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR') format = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) format = 'jpg';
  else if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) format = 'gif';
  else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') format = 'webp';
  else if (bytes.toString('ascii', 0, 2) === 'BM') format = 'bmp';
  if (!format || bytes.length < 24) throw new Error('图片文件无效。');
  await validateImageBytes(bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${digest}.${format}`);
  try { await writeFile(path, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return { path, digest };
}
