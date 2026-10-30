import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { stageImageUpload } from '../platforms/wechat/server/image-upload.mjs';

/** Boundary: image upload checks use generated or public-domain single-pixel bytes, never user media or native sending. */
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
async function directoryFor(t) {
  const directory = await mkdtemp(join(tmpdir(), 'somen-workspace-upload-'));
  t.after(async () => { assert.equal(resolve(dirname(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); });
  return directory;
}
test('client filenames never determine media paths and identical image bytes reuse one file', async t => {
  const directory = await directoryFor(t);
  const first = await stageImageUpload({ dataUrl: `data:image/png;base64,${pixel}`, fileName: '..\\..\\outside.png' }, directory);
  const second = await stageImageUpload({ dataUrl: `data:image/png;base64,${pixel}`, fileName: 'different.jpg' }, directory);
  assert.equal(first.path, second.path);
  assert.equal(dirname(first.path), directory);
  assert.match(first.path, /[a-f0-9]{64}\.png$/);
  assert.deepEqual(await readFile(first.path), Buffer.from(pixel, 'base64'));
  assert.equal((await readdir(directory)).length, 1);
});
test('unsupported formats and oversized uploads never write a media file', async t => {
  const directory = await directoryFor(t);
  for (const dataUrl of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/plain;base64,aGVsbG8=', 'data:image/png;base64,' + 'A'.repeat(17 * 1024 * 1024)]) {
    await assert.rejects(stageImageUpload({ dataUrl }, directory));
  }
  assert.deepEqual(await readdir(directory), []);
});
test('a truncated PNG header cannot be staged for the native image decoder', async t => {
  const directory = await directoryFor(t);
  const bytes = Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.write('IHDR', 12, 'ascii'); bytes.writeUInt32BE(1, 16); bytes.writeUInt32BE(1, 20);
  await assert.rejects(stageImageUpload({ dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }, directory));
});
