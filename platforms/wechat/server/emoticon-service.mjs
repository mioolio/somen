import { readBuiltinCatalog } from '../emoticons/builtin-catalog.mjs';

/** Boundary: installed built-in emoji catalog and exact token selection; never pretends to implement type-47 stickers. */
export function createEmoticonService({ getBinding, sendToken }) {
  let availableVersion = null;
  return {
    available: version => version != null && availableVersion === version,
    async list(query = '') {
      const binding = getBinding();
      if (!binding?.version || !binding.executablePath) return { items: [], supported: false, message: '先选择工作微信。' };
      try {
        const catalog = await readBuiltinCatalog({ binding, query });
        availableVersion = binding.version;
        return { ...catalog, supported: true, kinds: ['emoji'], stickerSupported: false };
      } catch (error) {
        availableVersion = null;
        if (error.code === 'BUILTIN_EMOJI_UNSUPPORTED') return { items: [], supported: false, message: '当前版本尚未适配表情目录。' };
        throw error;
      }
    },
    async send(input) {
      const binding = getBinding();
      const catalog = await readBuiltinCatalog({ binding, query: '' });
      const item = catalog.items.find(entry => entry.id === input?.emoticonId && entry.kind === 'emoji');
      if (!item) throw Object.assign(new Error('表情不存在或尚未适配。'), { code: 'EMOTICON_NOT_FOUND', statusCode: 400, outcome: 'not-sent' });
      return sendToken({ requestId: input.requestId, content: item.token });
    },
  };
}
