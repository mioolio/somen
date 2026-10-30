<script setup>
/** 边界：宿主通用空态与连接重试，不包含任何特定平台的业务文案。 */
import { inject } from 'vue';
import { PackageOpen, RefreshCw } from 'lucide-vue-next';
const { host, loadingHost, refreshHost } = inject('host');
</script>

<template>
  <section class="host-empty surface" aria-live="polite">
    <span class="empty-symbol"><PackageOpen :size="32" :stroke-width="1.5" /></span>
    <h1>{{ loadingHost ? '正在准备工作台' : host.error ? '本地服务暂时未连接' : '工作台已就绪' }}</h1>
    <p>{{ loadingHost ? '正在发现可用的平台。' : host.error || (host.platforms.length ? '从左侧选择一个平台，开始使用。' : '放入平台插件后，即可在这里打开。') }}</p>
    <ul v-if="host.failures.length" class="host-failures"><li v-for="failure in host.failures" :key="failure.id">{{ failure.id }}：{{ failure.message }}</li></ul>
    <button v-if="!loadingHost" class="button button-secondary" @click="refreshHost"><RefreshCw :size="16" />重新发现平台</button>
  </section>
</template>
