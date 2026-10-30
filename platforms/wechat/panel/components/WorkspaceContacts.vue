<script setup>
/** 边界：联系人只读列表和唯一测试联系人的选择，不持久化联系人或自行发送。 */
import { computed, ref } from 'vue';
import { UsersRound, Check } from 'lucide-vue-next';
const props = defineProps({ contacts: { type: Array, default: () => [] }, target: { type: Object, default: null }, busy: Boolean, active: Boolean });
defineEmits(['load', 'select']);
const query = ref('');
const visible = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return props.contacts.filter(contact => !term || `${contact.displayName || ''} ${contact.id}`.toLocaleLowerCase().includes(term));
});
</script>

<template>
  <section class="wx-work-contacts surface">
    <div class="wx-work-section-title"><h2>联系人 <span v-if="contacts.length" class="wx-work-count">{{ contacts.length }}</span></h2><button class="wx-work-text-button" :disabled="busy || !active" @click="$emit('load')">读取</button></div>
    <input v-if="contacts.length > 5" v-model="query" class="wx-work-input" type="search" aria-label="搜索联系人" placeholder="搜索联系人" />
    <ul v-if="visible.length" class="wx-work-contact-list"><li v-for="contact in visible" :key="contact.id"><span class="wx-work-contact-avatar"><UsersRound :size="18" /></span><div><strong>{{ contact.displayName || contact.id }}</strong><small v-if="contact.displayName">{{ contact.id }}</small></div><span v-if="target?.id === contact.id" class="wx-work-selected"><Check :size="14" />已选择</span><button v-else-if="contacts.length === 1 || contact.testAllowed === true" class="wx-work-text-button" :disabled="busy || !active" @click="$emit('select', contact)">使用</button></li></ul>
    <p v-else class="wx-work-empty">{{ contacts.length ? '无匹配联系人' : '暂无联系人' }}</p>
  </section>
</template>
