import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';

/** Boundary: Vue dev transformation only; API and platform registration live elsewhere. */
export default {
  configFile: false,
  root: fileURLToPath(new URL('../apps/panel/', import.meta.url)),
  plugins: [vue()],
  server: {
    middlewareMode: true,
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] },
  },
  appType: 'spa',
};
