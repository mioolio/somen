<script setup>
/** 边界：仅绘制导航、宿主状态与路由出口；所有平台页面由插件提供。 */
import { inject, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Blocks, ChevronRight, Monitor, ArrowUpRight } from 'lucide-vue-next';
import PlatformNavigation from './PlatformNavigation.vue';
import { findActivePlatform, findActiveModule } from './navigation.js';
import './shell.css';

const { host, loadingHost } = inject('host');
const route = useRoute();
const activePlatform = computed(() => findActivePlatform(host.value.platforms, route.path));
const activeModule = computed(() => activePlatform.value?.navigation
  ? findActiveModule(activePlatform.value, route.path) : undefined);
</script>

<template>
  <div class="workspace">
    <aside class="sidebar" aria-label="工作台导航">
      <RouterLink class="brand" to="/" aria-label="SOMEN 工作台首页">
        <span class="brand-mark"><Blocks :size="22" :stroke-width="1.8" /></span>
        <span>SOMEN</span>
      </RouterLink>

      <PlatformNavigation :platforms="host.platforms" :loading="loadingHost" />

      <div class="sidebar-footer"><Monitor :size="16" /><span>Windows</span></div>
    </aside>

    <div class="workspace-body">
      <header class="topbar">
        <div class="breadcrumbs">
          <template v-if="activePlatform">
            <span>{{ activePlatform.label }}</span>
            <template v-if="activeModule"><ChevronRight :size="14" /><strong>{{ activeModule.label }}</strong></template>
          </template>
          <strong v-else>工作台</strong>
        </div>
        <div class="topbar-meta"><span class="version-tag">v0.1</span></div>
      </header>
      <main class="main-content" id="main-content"><RouterView /></main>
      <footer class="workspace-footer"><a href="https://github.com/mioolio/somen" target="_blank" rel="noreferrer">GitHub <ArrowUpRight :size="14" /></a></footer>
    </div>
  </div>
</template>
