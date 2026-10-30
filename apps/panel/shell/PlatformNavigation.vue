<script setup>
/** 边界：绘制插件声明的平台父项与模块子项；不创建或修改平台业务路由。 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Puzzle } from 'lucide-vue-next';
import { findActivePlatform, findActiveModule } from './navigation.js';
import './navigation.css';

const props = defineProps({ platforms: { type: Array, required: true }, loading: Boolean });
const route = useRoute();
const activePlatform = computed(() => findActivePlatform(props.platforms, route.path));
const activeModule = computed(() => findActiveModule(activePlatform.value, route.path));

function isCurrent(platform, item) {
  return activePlatform.value?.id === platform.id && activeModule.value?.path === item.path;
}
</script>

<template>
  <nav class="platform-nav" aria-label="平台">
    <div class="nav-label">平台</div>
    <div v-for="platform in platforms" :key="platform.id" class="platform-group">
      <template v-if="platform.navigation">
        <div class="platform-group-title" :class="{ 'is-current': activePlatform?.id === platform.id }">
          <component :is="platform.icon || Puzzle" :size="20" :stroke-width="1.8" />
          <span class="navigation-text">{{ platform.label }}</span>
        </div>
        <ul class="platform-module-list" :aria-label="`${platform.label}模块`">
          <li v-for="item in platform.navigation" :key="item.id || item.path">
            <RouterLink :to="item.path" class="platform-module-link" active-class="" exact-active-class=""
              :class="{ 'is-active': isCurrent(platform, item) }">
              <span class="navigation-text">{{ item.label }}</span>
              <span class="nav-active-dot" aria-hidden="true"></span>
            </RouterLink>
          </li>
        </ul>
      </template>
      <RouterLink v-else :to="platform.path" class="platform-link" active-class="" exact-active-class=""
        :class="{ 'is-active': activePlatform?.id === platform.id }">
        <component :is="platform.icon || Puzzle" :size="20" :stroke-width="1.8" />
        <span class="navigation-text">{{ platform.label }}</span>
        <span class="nav-active-dot" aria-hidden="true"></span>
      </RouterLink>
    </div>
    <div v-if="!platforms.length" class="nav-empty">{{ loading ? '正在加载平台…' : '暂无可用平台' }}</div>
  </nav>
</template>
