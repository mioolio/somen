<script setup>
/** 边界：单个实例及其证据的只读呈现；不将候选、窗口标题或文件夹猜测为账号。 */
import { computed } from 'vue';
import { UserRound, ChevronDown, Check, CircleHelp, Layers } from 'lucide-vue-next';
import { formatTime, sourceLabel, formatEvidence } from '../utils/format.js';
const props = defineProps({ instance: { type: Object, required: true } });
const identified = computed(() => props.instance.status === 'identified'
  && Boolean(props.instance.account?.id) && props.instance.account?.verified !== false);
const statusLabel = computed(() => identified.value ? '已识别' : props.instance.status === 'ambiguous' ? '多项候选' : '待识别');
const processes = computed(() => props.instance.processIds?.length ? props.instance.processIds : [props.instance.pid]);
</script>

<template>
  <details class="instance-row">
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
        <div v-if="identified" class="detail-wide"><dt>识别依据</dt><dd>{{ formatEvidence(instance.account.evidence) || sourceLabel(instance.account.source) }}</dd></div>
      </dl>
      <div v-if="!identified" class="unidentified-note">{{ instance.status === 'ambiguous' ? '存在多项账号线索，尚未确认。' : '暂未取得可确认的账号信息。' }}</div>
      <div v-if="instance.role !== 'main'" class="unidentified-note">主进程身份待确认，未计入微信实例数。</div>
      <ul v-if="!identified && instance.candidates?.length" class="candidate-list"><li v-for="(candidate, index) in instance.candidates" :key="`${candidate.id}-${index}`"><strong>{{ candidate.id }}</strong><span>{{ sourceLabel(candidate.source) }}</span><p v-if="candidate.evidence">{{ formatEvidence(candidate.evidence) }}</p></li></ul>
    </div>
  </details>
</template>
