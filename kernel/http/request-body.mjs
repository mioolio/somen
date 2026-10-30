/** Boundary: bounded JSON transport parsing only; validation belongs to each plugin. */
export async function readJsonBody(request, { maxBytes = 65536 } = {}) {
  const fail = (code, message, statusCode) => Object.assign(new Error(message), { code, statusCode });
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw fail('JSON_REQUIRED', '请求需要 JSON。', 415);
  }
  if (Number(request.headers['content-length']) > maxBytes) throw fail('BODY_TOO_LARGE', '请求过大。', 413);
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw fail('BODY_TOO_LARGE', '请求过大。', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw fail('INVALID_JSON', '请求格式无效。', 400); }
}
