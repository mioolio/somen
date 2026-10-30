import { sendJson } from './responses.mjs';
import { readJsonBody } from './request-body.mjs';

/** Boundary: exact-match HTTP dispatch and disposable namespaces, no plugin imports. */
export function createRouter() {
  const routes = new Map();
  function namespace(prefix) {
    const owned = new Set();
    let closed = false;
    function register(method, path, handler) {
        if (closed) throw new Error('插件命名空间已释放');
        if (typeof path !== 'string' || !path.startsWith('/') || /[?#\\]/.test(path) || path.includes('..') || typeof handler !== 'function') {
          throw new Error('路由需要绝对子路径和处理函数');
        }
        const key = `${method} ${prefix}${path}`;
        if (routes.has(key)) throw new Error(`路由已注册：${key}`);
        routes.set(key, handler);
        owned.add(key);
    }
    return {
      get: (path, handler) => register('GET', path, handler),
      post: (path, handler) => register('POST', path, handler),
      dispose() { closed = true; for (const key of owned) routes.delete(key); owned.clear(); },
    };
  }
  async function dispatch(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const handler = routes.get(`${request.method} ${url.pathname}`);
    if (!handler) {
      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: '接口不存在或对应插件未启用。' } });
      return;
    }
    try {
      const data = await handler({ request, url, readJson: options => readJsonBody(request, options) });
      sendJson(response, 200, data);
    } catch (error) {
      sendJson(response, Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode <= 599 ? error.statusCode : 503, {
        error: {
          code: typeof error?.code === 'string' ? error.code : 'PLUGIN_UNAVAILABLE',
          message: typeof error?.message === 'string' ? error.message : '平台暂时无法使用，请重试。',
          ...(error?.outcome === 'not-sent' ? { outcome: 'not-sent' } : {}),
        },
      });
    }
  }
  return { namespace, dispatch };
}
