<script setup>
/** 边界：组合工作微信页面；账号、联系人、发送、表情与日志各自独立。 */
import { ArrowLeft, RefreshCw } from 'lucide-vue-next';
import { useWorkspace } from '../composables/use-workspace.js';
import { useWorkspaceSend } from '../composables/use-workspace-send.js';
import WorkspaceSelector from '../components/WorkspaceSelector.vue';
import WorkspaceContacts from '../components/WorkspaceContacts.vue';
import WorkspaceComposer from '../components/WorkspaceComposer.vue';
import WorkspaceEmoticons from '../components/WorkspaceEmoticons.vue';
import WorkspaceEvents from '../components/WorkspaceEvents.vue';
import '../styles/workspace.css';
import '../styles/workspace-messages.css';

const { workspace, instances, loading, busy, error, connected, canSend, bindingKey, refresh, select, loadContacts, selectTarget } = useWorkspace();
const { sending, receipt, error: sendError, uncertain, enabled, sendText, sendImage, sendEmoticon, clearUncertain } = useWorkspaceSend({ workspace, canSend, bindingKey, refresh });
const refreshAll = () => refresh({ includeInstances: true });
</script>

<template>
  <div class="wx-workspace">
    <header class="wx-work-heading"><h1>工作微信</h1><RouterLink to="/wechat" class="wx-work-back"><ArrowLeft :size="15" />进程</RouterLink></header>
    <div v-if="error" class="wx-work-alert" role="alert"><span>{{ error }}</span><button class="wx-work-text-button" :disabled="busy" @click="refreshAll">重试</button></div>
    <WorkspaceSelector :workspace="workspace" :instances="instances" :busy="busy || sending" :loading="loading" :connected="connected" @select="select" @refresh="refreshAll" />
    <div v-if="loading && !workspace.binding" class="wx-work-initial-loading" role="status" aria-label="加载中"><RefreshCw :size="21" class="spinning" /></div>
    <div v-if="workspace.binding" class="wx-work-grid">
      <div class="wx-work-left"><WorkspaceContacts :contacts="workspace.contacts || []" :target="workspace.target" :busy="busy || sending" :active="connected && workspace.status === 'active'" @load="loadContacts" @select="selectTarget" /><WorkspaceEvents :events="workspace.recentEvents || []" :checked-at="workspace.lastCheckedAt || ''" :log-status="workspace.diagnostics?.logStatus" /></div>
      <div class="wx-work-right"><WorkspaceComposer :enabled="enabled" :busy="sending || busy" :capabilities="workspace.capabilities" :target="workspace.target" :binding-key="bindingKey" :receipt="receipt" :uncertain="uncertain" :error="sendError" @text="sendText" @image="sendImage" @checked="clearUncertain" /><WorkspaceEmoticons :enabled="enabled" :busy="sending || busy" :capability="workspace.capabilities.emoticon === true" :binding-key="bindingKey" @send="sendEmoticon" /></div>
    </div>
  </div>
</template>
