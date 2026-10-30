<script setup>
/** 边界：展示扫描故障或受限诊断；不把受限扫描解释为零进程。 */
import { AlertCircle, Info, RefreshCw } from 'lucide-vue-next';
defineProps({ error: { type: String, default: '' }, warnings: { type: Array, default: () => [] }, loading: Boolean, hasSnapshot: Boolean });
defineEmits(['retry']);
</script>

<template>
  <div v-if="error" class="scan-error" role="alert"><AlertCircle :size="18" /><div><strong>{{ error }}</strong><p v-if="hasSnapshot">当前显示上次扫描的结果。</p></div><button class="notice-retry" :disabled="loading" @click="$emit('retry')"><RefreshCw :size="14" />重试</button></div>
  <div v-if="warnings.length" class="scan-notices" role="status"><Info :size="16" /><div><p v-for="(warning, index) in warnings" :key="`${warning.code}-${index}`">{{ warning.message }}</p></div></div>
</template>
