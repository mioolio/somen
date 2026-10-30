<script setup>
/** 边界：仅绘制导航、宿主状态与路由出口；所有平台页面由插件提供。 */
import { inject, computed } from 'vue';
import { useRoute } from 'vue-router';
import { Blocks, ChevronRight, Monitor, Puzzle, ArrowUpRight } from 'lucide-vue-next';
import './shell.css';

const { host, loadingHost } = inject('host');
const route = useRoute();
const activePlatform = computed(() => host.value.platforms.find((item) => route.path.startsWith(item.path)));
</script>

<template>
  <div class="workspace">
    <aside class="sidebar" aria-label="工作台导航">
      <RouterLink class="brand" to="/" aria-label="SOMEN 工作台首页">
        <span class="brand-mark"><Blocks :size="22" :stroke-width="1.8" /></span>
        <span>SOMEN</span>
      </RouterLink>

      <nav class="platform-nav" aria-label="平台">
        <div class="nav-label">平台</div>
        <RouterLink v-for="platform in host.platforms" :key="platform.id" :to="platform.path"
          class="platform-link" active-class="is-active">
          <component :is="platform.icon || Puzzle" :size="20" :stroke-width="1.8" />
          <span>{{ platform.label }}</span>
          <span class="nav-active-dot" aria-hidden="true"></span>
        </RouterLink>
        <div v-if="!host.platforms.length" class="nav-empty">{{ loadingHost ? '正在加载平台…' : '暂无可用平台' }}</div>
      </nav>

      <div class="sidebar-footer"><Monitor :size="16" /><span>Windows</span></div>
    </aside>

    <div class="workspace-body">
      <header class="topbar">
        <div class="breadcrumbs"><span>平台</span><ChevronRight :size="14" /><strong>{{ activePlatform?.label || '工作台' }}</strong></div>
        <div class="topbar-meta"><span class="version-tag">v0.1</span></div>
      </header>
      <main class="main-content" id="main-content"><RouterView /></main>
      <footer class="workspace-footer"><a href="https://github.com/mioolio/somen" target="_blank" rel="noreferrer">GitHub <ArrowUpRight :size="14" /></a></footer>
    </div>
  </div>
</template>
