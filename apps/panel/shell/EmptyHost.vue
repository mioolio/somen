<script setup>
/** 边界：宿主通用空态与连接重试，不包含任何特定平台的业务文案。 */
import { inject } from 'vue';
import { PackageOpen, RefreshCw } from 'lucide-vue-next';
const { host, loadingHost, refreshHost } = inject('host');
</script>

<template>
  <section class="host-empty surface" aria-live="polite">
    <span class="empty-symbol"><PackageOpen :size="32" :stroke-width="1.5" /></span>
    <h1>{{ loadingHost ? '加载中' : host.error ? '连接失败' : host.platforms.length ? '选择平台' : '暂无平台' }}</h1>
    <p v-if="host.error">{{ host.error }}</p>
    <ul v-if="host.failures.length" class="host-failures"><li v-for="failure in host.failures" :key="failure.id">{{ failure.id }}：{{ failure.message }}</li></ul>
    <button v-if="!loadingHost" class="button button-secondary" @click="refreshHost"><RefreshCw :size="16" />刷新</button>
  </section>
</template>
