import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { createHost } from '../kernel/host.mjs';
import { allowLocalRequest } from '../kernel/http/local-access.mjs';
import viteConfig from './vite.config.mjs';

/** Boundary: Windows-only development lifecycle. npm run dev needs no prior build. */
if (process.platform !== 'win32') {
  console.error('SOMEN 当前仅支持 WINDOWS。其他系统适配欢迎通过独立平台适配器贡献。');
  process.exit(1);
}
const port = Number(process.env.SOMEN_PORT || 5173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('SOMEN_PORT 需要为 1024–65535');
const host = await createHost({ platformsDirectory: fileURLToPath(new URL('../platforms/', import.meta.url)) });
const server = createServer();
const vite = await createVite({ ...viteConfig, server: { ...viteConfig.server, hmr: { server } } });
server.on('request', (request, response) => {
  if (!allowLocalRequest(request, response, port)) return;
  if (request.url.split('?')[0].startsWith('/api/')) {
    host.dispatch(request, response).catch(error => { console.error(error); response.destroy(); });
  } else vite.middlewares(request, response);
});
server.on('error', async error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被使用；请设置 SOMEN_PORT 后重试。` : error.message);
  await vite.close();
  await host.dispose();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  SOMEN · Windows 本地工作台\n  http://127.0.0.1:${port}\n  独立平台插件已加载，Ctrl+C 停止\n`);
});
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  server.closeAllConnections();
  await Promise.allSettled([vite.close(), host.dispose()]);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
