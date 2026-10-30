<script setup>
/** 边界：组合微信识别专属视图；扫描逻辑、格式化与单项展示由独立模块负责。 */
import { RefreshCw, Clock3, Activity } from 'lucide-vue-next';
import { useInstances } from '../composables/use-instances.js';
import { formatTime, formatDuration } from '../utils/format.js';
import ScanStats from '../components/ScanStats.vue';
import ScanToolbar from '../components/ScanToolbar.vue';
import ScanNotice from '../components/ScanNotice.vue';
import InstanceRow from '../components/InstanceRow.vue';
import InstancesEmpty from '../components/InstancesEmpty.vue';
import '../styles/page.css';
import '../styles/instances.css';

const { snapshot, loading, error, query, autoRefresh, filteredInstances, scan } = useInstances();
</script>

<template>
  <div class="wechat-page">
    <section class="wechat-heading" aria-labelledby="wechat-title"><h1 id="wechat-title">微信多进程</h1><button class="button button-primary scan-button" :disabled="loading" @click="scan"><RefreshCw :size="16" :class="{ spinning: loading }" />{{ loading ? '扫描中' : '重新扫描' }}</button></section>

    <ScanStats :snapshot="snapshot" :loading="loading" />
    <ScanNotice :error="error" :warnings="snapshot?.warnings || []" :loading="loading" :has-snapshot="Boolean(snapshot)" @retry="scan" />

    <section class="instances-panel surface" aria-labelledby="instances-title" :aria-busy="loading">
      <div class="panel-heading"><div class="panel-title"><span class="panel-title-marker"></span><h2 id="instances-title">实例</h2><span class="result-count">{{ snapshot?.instanceCount ?? '—' }}</span></div></div>
      <ScanToolbar v-model:query="query" v-model:auto-refresh="autoRefresh" />
      <div v-if="loading && !snapshot" class="scan-loading" role="status" aria-label="扫描中"><RefreshCw :size="23" class="spinning" /></div>
      <div v-else-if="!snapshot && error" class="scan-initial-error"><Activity :size="29" :stroke-width="1.4" /><strong>暂无扫描结果</strong></div>
      <template v-else-if="filteredInstances.length"><div class="instance-columns" aria-hidden="true"><span>账号</span><span>PID</span><span>版本</span><span></span></div><div class="instance-list"><InstanceRow v-for="instance in filteredInstances" :key="instance.id || instance.pid" :instance="instance" /></div></template>
      <InstancesEmpty v-else :searching="Boolean(query.trim())" :restricted="Boolean(snapshot?.warnings?.length)" @clear="query = ''" />
      <div v-if="snapshot" class="panel-footer"><span class="scan-time"><Clock3 :size="13" /><span>上次扫描 {{ formatTime(snapshot.scannedAt) }}</span><span v-if="error" class="stale-label">上次结果</span></span><span class="scan-duration">耗时 {{ formatDuration(snapshot.durationMs) }}<span v-if="query.trim()"> · 匹配 {{ filteredInstances.length }} 项</span></span></div>
    </section>

  </div>
</template>
