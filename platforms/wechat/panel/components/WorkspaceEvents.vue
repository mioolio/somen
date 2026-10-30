<script setup>
/** 边界：运行事件摘要的只读显示；不读取日志文件、不展示聊天内容或原始崩溃内存。 */
import { computed } from 'vue';
const props = defineProps({ events: { type: Array, default: () => [] }, checkedAt: { type: String, default: '' }, logStatus: { type: Object, default: null } });
const recent = computed(() => props.events.slice(-8).reverse());
function time(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour12: false }); }
</script>

<template>
  <section class="wx-work-events surface"><div class="wx-work-section-title"><h2>运行记录</h2><span v-if="logStatus" class="wx-work-check-time">{{ logStatus.available ? '日志正常' : '日志不可写' }}</span></div><ul v-if="recent.length"><li v-for="(event, index) in recent" :key="`${event.at || event.timestamp}-${index}`"><time>{{ time(event.at || event.timestamp) }}</time><span>{{ event.message || event.code || event.type }}</span></li></ul><p v-if="checkedAt" class="wx-work-check-time">检查 {{ time(checkedAt) }}</p></section>
</template>
