import { sendJson } from './responses.mjs';

/** Boundary: loopback same-origin access. The host never exposes local account data to LAN. */
export function allowLocalRequest(request, response, port) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const host = request.headers.host;
  let originAllowed = !request.headers.origin;
  try {
    if (request.headers.origin) {
      const origin = new URL(request.headers.origin);
      originAllowed = origin.protocol === 'http:' && origin.host === host;
    }
  } catch { originAllowed = false; }
  if (!allowedHosts.has(host) || !originAllowed || request.headers['sec-fetch-site'] === 'cross-site') {
    sendJson(response, 403, { error: { code: 'LOCAL_ONLY', message: '请从本机工作台访问。' } });
    return false;
  }
  return true;
}
