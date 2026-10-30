<script setup>
/** 边界：工作进程选择与跟踪状态呈现，选择请求由页面状态模块执行。 */
import { computed, ref, watch } from 'vue';
import { RefreshCw, Radio } from 'lucide-vue-next';
const props = defineProps({ workspace: { type: Object, required: true }, instances: { type: Array, default: () => [] }, busy: Boolean, loading: Boolean, connected: Boolean });
const emit = defineEmits(['select', 'refresh']);
const choice = ref('');
const switching = ref(false);
const instanceKey = item => `${item.pid}:${item.startedAt}`;
const currentKey = () => props.workspace.binding ? instanceKey(props.workspace.binding) : '';
watch(currentKey, key => {
  switching.value = false;
  choice.value = props.instances.some(item => instanceKey(item) === key) ? key : '';
}, { immediate: true });
watch(() => props.instances.map(instanceKey).join('|'), () => {
  if (props.instances.some(item => instanceKey(item) === choice.value)) return;
  const binding = props.workspace.binding;
  if (binding && props.instances.some(item => instanceKey(item) === instanceKey(binding))) choice.value = instanceKey(binding);
  else choice.value = '';
}, { immediate: true });
const selected = computed(() => props.instances.find(item => instanceKey(item) === choice.value));
const isCurrent = computed(() => selected.value && props.workspace.binding && instanceKey(selected.value) === instanceKey(props.workspace.binding));
const statusLabel = computed(() => {
  if (!props.connected && !props.loading) return '未连接';
  return ({ idle: '未选择', active: '跟踪中', lost: '进程已退出', changed: '账号已变化', error: '跟踪异常' })[props.workspace.status] || '待确认';
});
</script>

<template>
  <section class="wx-work-selector surface" aria-label="工作账号">
    <div class="wx-work-section-title"><h2>账号</h2><span :class="['wx-work-status', { active: connected && workspace.status === 'active' }]"><Radio :size="13" />{{ statusLabel }}</span></div>
    <div v-if="workspace.binding" class="wx-work-current"><strong>{{ workspace.binding.accountId }}</strong><span>PID {{ workspace.binding.pid }}</span><button v-if="workspace.status === 'active'" class="wx-work-text-button wx-work-switch" :disabled="busy" @click="switching = !switching">{{ switching ? '收起' : '切换' }}</button></div>
    <div v-if="!workspace.binding || switching || workspace.status !== 'active'" class="wx-work-picker">
      <label class="sr-only" for="work-wechat-choice">工作微信</label>
      <select id="work-wechat-choice" v-model="choice" :disabled="busy || loading"><option value="">选择微信</option><option v-for="instance in instances" :key="instanceKey(instance)" :value="instanceKey(instance)">{{ instance.account.id }} · {{ instance.pid }}</option></select>
      <button class="button button-primary" :disabled="!selected || busy || (isCurrent && workspace.status === 'active')" @click="emit('select', selected)">使用</button>
      <button class="wx-work-icon-button" title="刷新进程" aria-label="刷新进程" :disabled="busy || loading" @click="emit('refresh')"><RefreshCw :size="17" :class="{ spinning: loading }" /></button>
    </div>
    <p v-if="!loading && !instances.length && !workspace.binding" class="wx-work-empty">未检测到可用微信</p>
  </section>
</template>
