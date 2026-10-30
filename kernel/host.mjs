import { createRouter } from './http/router.mjs';
import { discoverPlugins } from './plugins/discover.mjs';

/** Boundary: compose generic discovery + API dispatch, with no knowledge of platforms. */
export async function createHost({ platformsDirectory }) {
  const router = createRouter();
  const plugins = await discoverPlugins({ directory: platformsDirectory, router });
  const hostRoutes = router.namespace('/api');
  hostRoutes.get('/platforms', () => ({ platforms: plugins.platforms, os: 'windows' }));
  return {
    dispatch: router.dispatch,
    async dispose() { hostRoutes.dispose(); await plugins.dispose(); },
  };
}
