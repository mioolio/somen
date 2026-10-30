/** Boundary: HTTP JSON formatting only; contains no platform or discovery logic. */
export function sendJson(response, status, data) {
  if (response.writableEnded || response.destroyed) return;
  // Serialize before committing headers so an invalid plugin payload can become a clean 503.
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}
