import sharp from 'sharp';

/** Boundary: fully decode bounded image bytes before passing them to the selected native client. */
export async function validateImageBytes(bytes) {
  try {
    const decoder = sharp(bytes, { animated: true, limitInputPixels: 16 * 1024 * 1024, failOn: 'warning' });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > 16 * 1024 * 1024) throw new Error('image size');
    await decoder.stats();
  } catch {
    throw Object.assign(new Error('图片文件损坏、格式不支持或像素数量过大。'), { code: 'INVALID_IMAGE', outcome: 'not-sent' });
  }
}
