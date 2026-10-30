<script setup>
/** 边界：当前实例的工作页面；只组合状态、联系人、发送、表情与日志，不选择或切换实例。 */
import { ArrowLeft, RefreshCw } from 'lucide-vue-next';
import { useWorkspace } from '../composables/use-workspace.js';
import { useWorkspaceSend } from '../composables/use-workspace-send.js';
import WorkspaceStatus from '../components/WorkspaceStatus.vue';
import WorkspaceContacts from '../components/WorkspaceContacts.vue';
import WorkspaceComposer from '../components/WorkspaceComposer.vue';
import WorkspaceEmoticons from '../components/WorkspaceEmoticons.vue';
import WorkspaceEvents from '../components/WorkspaceEvents.vue';
import '../styles/workspace.css';
import '../styles/workspace-messages.css';

const { workspace, loading, busy, error, connected, canSend, bindingKey, refresh, loadContacts, selectTarget } = useWorkspace();
const { sending, receipt, error: sendError, uncertain, enabled, sendText, sendImage, sendEmoticon, clearUncertain } = useWorkspaceSend({ workspace, canSend, bindingKey, refresh });
const refreshAll = () => refresh({ clearErrors: true });
</script>

<template>
  <div class="wx-workspace">
    <header class="wx-work-heading"><h1>工作</h1><RouterLink to="/wechat" class="wx-work-back"><ArrowLeft :size="15" />平台选择器</RouterLink></header>
    <div v-if="error" class="wx-work-alert" role="alert"><span>{{ error }}</span><button class="wx-work-text-button" :disabled="busy" @click="refreshAll">重试</button></div>
    <WorkspaceStatus :workspace="workspace" :loading="loading" :connected="connected" />
    <div v-if="loading && !workspace.binding" class="wx-work-initial-loading" role="status" aria-label="加载中"><RefreshCw :size="21" class="spinning" /></div>
    <div v-if="workspace.binding" class="wx-work-grid">
      <div class="wx-work-left"><WorkspaceContacts :contacts="workspace.contacts || []" :target="workspace.target" :busy="busy || sending" :active="connected && workspace.status === 'active'" @load="loadContacts" @select="selectTarget" /><WorkspaceEvents :events="workspace.recentEvents || []" :checked-at="workspace.lastCheckedAt || ''" :log-status="workspace.diagnostics?.logStatus" /></div>
      <div class="wx-work-right"><WorkspaceComposer :enabled="enabled" :busy="sending || busy" :capabilities="workspace.capabilities" :target="workspace.target" :binding-key="bindingKey" :receipt="receipt" :uncertain="uncertain" :error="sendError" @text="sendText" @image="sendImage" @checked="clearUncertain" /><WorkspaceEmoticons :enabled="enabled" :busy="sending || busy" :capability="workspace.capabilities.emoticon === true" :binding-key="bindingKey" @send="sendEmoticon" /></div>
    </div>
  </div>
</template>
