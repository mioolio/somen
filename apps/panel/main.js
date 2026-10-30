/**
 * 边界：组装通用面板壳与平台插件，不直接导入任何平台业务。
 * 插件只通过 register.js 提供独立路由；移走平台目录后宿主仍可启动。
 */
import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './shell/App.vue';
import EmptyHost from './shell/EmptyHost.vue';
import { host, loadingHost, discoverPlatforms } from './shell/platform-registry.js';
import './styles/tokens.css';
import './styles/base.css';

const modules = import.meta.glob('../../platforms/*/panel/register.js');
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'host', component: EmptyHost },
    { path: '/:pathMatch(.*)*', name: 'missing', component: EmptyHost },
  ],
});
let removeRoutes = [];
let pending;

/** 同一时刻只允许一次发现；重试时撤销旧注册，防止重复路由。 */
function refreshHost() {
  if (pending) return pending;
  loadingHost.value = true;
  pending = (async () => {
    await discoverPlatforms(modules);
    for (const remove of removeRoutes) remove();
    removeRoutes = host.value.platforms.flatMap((platform) =>
      platform.routes.map((route) => router.addRoute(route)),
    );
    await router.isReady();
    const current = router.currentRoute.value;
    const target = current.path === '/' ? host.value.platforms[0]?.path : current.fullPath;
    if (target) await router.replace(target);
  })().finally(() => {
    // Host readiness includes the lazy route component, not only plugin discovery.
    loadingHost.value = false;
    pending = undefined;
  });
  return pending;
}

createApp(App)
  .provide('host', { host, loadingHost, refreshHost })
  .use(router)
  .mount('#app');
void refreshHost();
