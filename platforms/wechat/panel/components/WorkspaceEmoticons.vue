<script setup>
/** 边界：服务端表情与表情包列表、筛选和点击选择；预览只允许同源或图片 data URL。 */
import { computed, toRef } from 'vue';
import { Search, RefreshCw, Smile } from 'lucide-vue-next';
import { useEmoticons } from '../composables/use-emoticons.js';
const props = defineProps({ enabled: Boolean, busy: Boolean, capability: Boolean, bindingKey: { type: String, default: '' } });
defineEmits(['send']);
const { query, kind, items, supported, loading, error, message, load } = useEmoticons(toRef(props, 'bindingKey'));
const canSend = computed(() => props.enabled && props.capability && supported.value && !props.busy);
function safePreview(value) {
  if (typeof value !== 'string') return '';
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(value)) return value;
  try { const url = new URL(value, location.origin); return url.origin === location.origin && url.protocol === location.protocol ? url.href : ''; }
  catch { return ''; }
}
</script>

<template>
  <section class="wx-work-emoticons surface">
    <div class="wx-work-section-title"><h2>表情</h2><button class="wx-work-icon-button" aria-label="刷新表情" title="刷新表情" :disabled="loading" @click="load"><RefreshCw :size="16" :class="{ spinning: loading }" /></button></div>
    <div class="wx-work-emoticon-controls"><label class="wx-work-search"><Search :size="16" /><input v-model="query" type="search" placeholder="搜索表情" aria-label="搜索表情" :disabled="!supported && !items.length" /></label><div v-if="supported" class="wx-work-tabs" role="tablist" aria-label="表情类型"><button role="tab" :aria-selected="kind === 'all'" :class="{ selected: kind === 'all' }" @click="kind = 'all'">全部</button><button role="tab" :aria-selected="kind === 'emoji'" :class="{ selected: kind === 'emoji' }" @click="kind = 'emoji'">表情</button><button role="tab" :aria-selected="kind === 'sticker'" :class="{ selected: kind === 'sticker' }" @click="kind = 'sticker'">表情包</button></div></div>
    <div v-if="items.length" class="wx-work-emoticon-grid"><button v-for="item in items" :key="item.id" class="wx-work-emoticon-item" :title="item.title || item.id" :aria-label="`发送${item.title || '表情'}`" :disabled="!canSend" @click="$emit('send', item.id)"><img v-if="safePreview(item.previewUrl)" :src="safePreview(item.previewUrl)" :alt="item.title || '表情'" loading="lazy" /><span v-else-if="item.text" class="wx-work-emoji-text">{{ item.text }}</span><Smile v-else :size="28" /><small>{{ item.title || item.id }}</small></button></div>
    <p v-else class="wx-work-empty" :role="loading ? 'status' : undefined">{{ loading ? '加载中' : error || message || (supported ? '暂无表情' : '表情暂不可用') }}</p>
  </section>
</template>
