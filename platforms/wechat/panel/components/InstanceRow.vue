<script setup>
/** 边界：呈现单个实例与选择按钮；仅发出选择事件，不绑定账号或读取联系人。 */
import { computed } from 'vue';
import { UserRound, ChevronDown, Check, CircleHelp, Layers } from 'lucide-vue-next';
import { formatTime } from '../utils/format.js';
const props = defineProps({ instance: { type: Object, required: true }, selectionBusy: Boolean, selecting: Boolean, working: Boolean });
defineEmits(['select']);
const identified = computed(() => props.instance.status === 'identified'
  && Boolean(props.instance.account?.id) && props.instance.account?.verified !== false);
const statusLabel = computed(() => identified.value ? '已识别' : props.instance.status === 'ambiguous' ? '多项候选' : '待识别');
const processes = computed(() => props.instance.processIds?.length ? props.instance.processIds : [props.instance.pid]);
const selectable = computed(() => props.instance.role === 'main' && props.instance.status === 'identified'
  && props.instance.account?.verified === true && Boolean(props.instance.startedAt));
</script>

<template>
  <article class="instance-row">
  <details class="instance-disclosure">
    <summary class="instance-summary">
      <div class="instance-identity">
        <span :class="['account-avatar', { identified }]"><UserRound :size="20" :stroke-width="1.7" /></span>
        <div class="identity-copy">
          <div class="account-name" :title="instance.account?.id">{{ identified ? instance.account.id : '—' }}</div>
          <div class="account-status">
            <span :class="['status-badge', { identified, ambiguous: instance.status === 'ambiguous' }]">
              <Check v-if="identified" :size="11" /><CircleHelp v-else :size="11" />{{ statusLabel }}
            </span>
            <span v-if="instance.role !== 'main'" class="role-badge">客户端待确认</span>
          </div>
        </div>
      </div>
      <div class="instance-process">
        <span class="pid-label"><strong>{{ instance.pid }}</strong></span>
        <span class="process-name">{{ instance.processName || '—' }}</span>
      </div>
      <div class="instance-version">
        <span>{{ instance.version || '—' }}</span>
        <span class="process-count"><Layers :size="12" />{{ processes.length }} 个进程</span>
      </div>
      <span class="row-expand"><span>详情</span><ChevronDown :size="15" /></span>
    </summary>
    <div class="instance-details">
      <dl class="detail-grid">
        <div v-if="instance.windowTitle"><dt>窗口</dt><dd>{{ instance.windowTitle }}</dd></div>
        <div v-if="instance.startedAt"><dt>启动时间</dt><dd>{{ formatTime(instance.startedAt, true) }}</dd></div>
        <div v-if="instance.version"><dt>版本</dt><dd>{{ instance.version }}</dd></div>
        <div><dt>关联 PID</dt><dd class="mono">{{ processes.join(' / ') }}</dd></div>
        <div v-if="instance.parentPid"><dt>父进程</dt><dd class="mono">{{ instance.parentPid }}</dd></div>
        <div v-if="instance.executablePath" class="detail-wide"><dt>路径</dt><dd class="mono">{{ instance.executablePath }}</dd></div>
      </dl>
    </div>
  </details>
  <div class="instance-actions"><button class="button button-secondary instance-work-button" :disabled="!selectable || selectionBusy" @click="$emit('select', instance)">{{ selecting ? '处理中' : working ? '进入工作' : '设为工作' }}</button></div>
  </article>
</template>
