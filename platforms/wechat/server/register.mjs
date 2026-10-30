import { createScanService } from './scan-service.mjs';
import { createWorkspaceService } from './workspace-service.mjs';
import { registerWorkspaceRoutes } from './workspace-routes.mjs';

/** Boundary: this platform owns /api/wechat only; no central route table is modified. */
export function register({ router, onDispose }) {
  const service = createScanService();
  router.get('/instances', () => service.scan());
  onDispose(() => service.dispose());
  const workspace = createWorkspaceService();
  registerWorkspaceRoutes(router, workspace);
  onDispose(() => workspace.dispose());
  // Restore in the background so slow OS metadata cannot stall plugin registration.
  void workspace.restore();
}
