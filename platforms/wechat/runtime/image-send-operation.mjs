import { readSendImage, writeNativeImage } from './image-resource.mjs';

/**
 * Boundary: stage one image for an already bound native session. One idle wait
 * precedes preparation. Submit must recheck live account/target and the agent
 * must check active work again; this helper never grants a reusable send proof.
 */
export function createImageSender({ accountId, requireLive, recipientId, waitIdle, prepare, submit,
  readImage = readSendImage, writeImage = writeNativeImage }) {
  return async function sendImage({ requestId, path }) {
    await requireLive();
    const to = recipientId();
    if (!to) throw new Error('尚未绑定测试联系人。');
    if (!await waitIdle()) throw new Error('微信仍在处理上一项操作。');
    const image = await readImage(path);
    const prepared = await prepare({ to, imageResource: image.resource, imageSha256: image.sha256 });
    if (prepared.self !== accountId || prepared.chatId !== to || prepared.imageSha256 !== image.sha256) {
      throw new Error('微信图片资源绑定校验失败。');
    }
    await writeImage(image, prepared.cachePath);
    return submit({ requestId, imageResource: image.resource, imageSha256: image.sha256 });
  };
}
