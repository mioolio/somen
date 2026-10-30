<script setup>
/** 边界：微信扫描与筛选空态；loading/error 由页面单独处理。 */
import { MessagesSquare, SearchX, ArrowRight } from 'lucide-vue-next';
defineProps({ searching: Boolean, restricted: Boolean });
defineEmits(['clear']);
</script>

<template>
  <div class="instances-empty">
    <span class="empty-wechat"><component :is="searching ? SearchX : MessagesSquare" :size="30" :stroke-width="1.5" /></span>
    <h3>{{ searching ? '没有匹配结果' : '未发现微信' }}</h3>
    <p v-if="!searching && !restricted">打开微信后重新扫描。</p>
    <button v-if="searching" class="clear-filter-button" @click="$emit('clear')">清除筛选 <ArrowRight :size="14" /></button>
  </div>
</template>
