import { createScanService } from './scan-service.mjs';

/** Boundary: this platform owns /api/wechat only; no central route table is modified. */
export function register({ router, onDispose }) {
  const service = createScanService();
  router.get('/instances', () => service.scan());
  onDispose(() => service.dispose());
}
