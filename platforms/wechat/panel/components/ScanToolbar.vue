<script setup>
/** 边界：搜索与轮询开关控件；通过 v-model 交由本平台页面持有状态。 */
import { Search, X } from 'lucide-vue-next';
const query = defineModel('query', { type: String, default: '' });
const autoRefresh = defineModel('autoRefresh', { type: Boolean, default: false });
</script>

<template>
  <div class="scan-toolbar">
    <label class="search-input"><Search :size="16" /><span class="sr-only">搜索账号或 PID</span><input v-model="query" type="search" placeholder="搜索账号或 PID" autocomplete="off" /><button v-if="query" class="clear-search" aria-label="清空搜索" @click="query = ''"><X :size="14" /></button></label>
    <label class="auto-refresh"><input v-model="autoRefresh" type="checkbox" role="switch" /><span class="switch-track" aria-hidden="true"></span><span>自动刷新</span><span class="refresh-interval">15s</span></label>
  </div>
</template>
