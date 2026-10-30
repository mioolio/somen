<script setup>
/** 边界：只呈现当前工作实例与监控状态；实例选择只属于平台选择器模块。 */
import { computed } from 'vue';
import { Radio } from 'lucide-vue-next';
const props = defineProps({ workspace: { type: Object, required: true }, loading: Boolean, connected: Boolean });
const statusLabel = computed(() => {
  if (props.loading) return '加载中';
  if (!props.connected) return '未连接';
  return ({ idle: '未选择', active: '跟踪中', lost: '进程已退出', changed: '账号已变化', error: '跟踪异常' })[props.workspace.status] || '待确认';
});
</script>

<template>
  <section class="wx-work-status-card surface" aria-label="当前工作实例">
    <div class="wx-work-section-title"><h2>当前实例</h2><span :class="['wx-work-status', { active: connected && workspace.status === 'active' }]"><Radio :size="13" />{{ statusLabel }}</span></div>
    <div v-if="workspace.binding" class="wx-work-current"><strong>{{ workspace.binding.accountId }}</strong><span>PID {{ workspace.binding.pid }}</span></div>
    <p v-if="workspace.reason?.message" class="wx-work-error">{{ workspace.reason.message }}</p>
  </section>
</template>
