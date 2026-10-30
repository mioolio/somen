import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageSender } from '../image-send-operation.mjs';

/** Boundary: image staging with in-memory doubles; never writes a Weixin cache or submits native work. */
function fixture(overrides = {}) {
  const calls = [];
  const image = { bytes: Buffer.from('fixture'), resource: 'fixture_resource', sha256: 'fixture_digest' };
  const prepared = { self: 'fixture_self', chatId: 'fixture_target', imageSha256: image.sha256, cachePath: 'fixture_cache' };
  const dependencies = {
    accountId: prepared.self,
    requireLive: async () => { calls.push('live'); },
    recipientId: () => prepared.chatId,
    waitIdle: async () => { calls.push('idle'); return true; },
    readImage: async path => { calls.push('read'); assert.equal(path, 'fixture_path'); return image; },
    prepare: async input => { calls.push('prepare'); assert.equal(input.to, prepared.chatId); return prepared; },
    writeImage: async (value, path) => { calls.push('write'); assert.equal(value, image); assert.equal(path, prepared.cachePath); },
    submit: async input => { calls.push('submit'); assert.deepEqual(input, { requestId: 'fixture-request', imageResource: image.resource, imageSha256: image.sha256 }); return { status: 'accepted' }; },
    ...overrides,
  };
  return { calls, image, prepared, dependencies, send: createImageSender(dependencies) };
}
const request = { requestId: 'fixture-request', path: 'fixture_path' };

test('one idle wait precedes image resource preparation and immutable write', async () => {
  const { send, calls } = fixture();
  assert.deepEqual(await send(request), { status: 'accepted' });
  assert.deepEqual(calls, ['live', 'idle', 'read', 'prepare', 'write', 'submit']);
});

test('busy image preparation does not read media or enter native preparation', async () => {
  const { send, calls } = fixture({ waitIdle: async () => false });
  await assert.rejects(send(request), /上一项操作/);
  assert.deepEqual(calls, ['live']);
});

test('account, recipient and digest mismatches prevent the native cache write', async () => {
  for (const field of ['self', 'chatId', 'imageSha256']) {
    const { send, calls } = fixture({ prepare: async () => ({ self: 'fixture_self', chatId: 'fixture_target', imageSha256: 'fixture_digest', [field]: 'changed' }) });
    await assert.rejects(send(request), /绑定校验失败/);
    assert.deepEqual(calls, ['live', 'idle', 'read']);
  }
});

test('a final live-account rejection from submit is propagated without retry', async () => {
  let submits = 0;
  const failure = Object.assign(new Error('fixture account changed'), { code: 'WORK_ACCOUNT_CHANGED' });
  const { send } = fixture({ submit: async () => { submits++; throw failure; } });
  await assert.rejects(send(request), failure);
  assert.equal(submits, 1);
});
