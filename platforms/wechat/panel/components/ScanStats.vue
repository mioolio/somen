<script setup>
/** 边界：扫描汇总展示；数值完全来自后端快照，不以界面行数替代实例数。 */
import { computed } from 'vue';
import { AppWindow, Cpu, BadgeCheck, ScanLine } from 'lucide-vue-next';
const props = defineProps({ snapshot: { type: Object, default: null }, loading: Boolean });
const stats = computed(() => [
  { label: '微信实例', value: props.snapshot?.confirmedInstanceCount, icon: AppWindow, tone: 'blue' },
  { label: '进程', value: props.snapshot?.processCount, icon: Cpu, tone: 'purple' },
  { label: '已识别', value: props.snapshot?.identifiedCount, icon: BadgeCheck, tone: 'green' },
  { label: '待识别', value: props.snapshot ? Math.max(0, props.snapshot.instanceCount - props.snapshot.identifiedCount) : undefined, icon: ScanLine, tone: 'amber' },
]);
</script>

<template>
  <div class="scan-stats" aria-label="本机微信识别汇总" :aria-busy="loading">
    <article v-for="stat in stats" :key="stat.label" class="stat-card surface">
      <div class="stat-heading"><span>{{ stat.label }}</span><span :class="['stat-icon', stat.tone]"><component :is="stat.icon" :size="18" :stroke-width="1.7" /></span></div>
      <div class="stat-value">{{ stat.value ?? '—' }}</div>
    </article>
  </div>
</template>
