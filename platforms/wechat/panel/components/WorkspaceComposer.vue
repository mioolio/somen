<script setup>
/** 边界：文字和本地图片草稿；文件只在本页内存中，按一次点击发出一次发送事件。 */
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Send, ImagePlus, X } from 'lucide-vue-next';
const props = defineProps({ enabled: Boolean, busy: Boolean, capabilities: { type: Object, default: () => ({}) }, target: { type: Object, default: null }, bindingKey: { type: String, default: '' }, receipt: { type: Object, default: null }, uncertain: Boolean, error: { type: String, default: '' } });
const emit = defineEmits(['text', 'image', 'checked']);
const mode = ref('text');
const text = ref('');
const file = ref(null);
const preview = ref('');
const fileError = ref('');
const fileInput = ref(null);
const reading = ref(false);
const capability = computed(() => mode.value === 'text' ? props.capabilities.text === true : props.capabilities.image === true);
const textBytes = computed(() => new TextEncoder().encode(text.value).length);
const textInvalid = computed(() => text.value.includes('\0') || !text.value.isWellFormed() || textBytes.value > 1024);
const ready = computed(() => props.enabled && !reading.value && capability.value && (mode.value === 'text' ? Boolean(text.value.trim()) && !textInvalid.value : Boolean(file.value)));
const receiptLabel = computed(() => ({ sent: '已发送', submitted: '已提交', unknown: '发送结果未确认', failed: '未发送', pending: '发送中' })[props.receipt?.status] || '');
function clearImage() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  file.value = null;
  preview.value = '';
  fileError.value = '';
  if (fileInput.value) fileInput.value.value = '';
}
function pickImage(event) {
  const selected = event.target.files?.[0];
  clearImage();
  if (!selected) return;
  if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(selected.type)) { fileError.value = '请选择 PNG、JPEG、GIF、WebP 或 BMP'; return; }
  if (selected.size > 12 * 1024 * 1024) { fileError.value = '图片不能超过 12 MiB'; return; }
  file.value = selected;
  preview.value = URL.createObjectURL(selected);
}
async function submit() {
  if (!ready.value) return;
  if (mode.value === 'text') { emit('text', text.value); return; }
  reading.value = true;
  const selected = file.value;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(selected);
    });
    if (selected === file.value && props.enabled) emit('image', { dataUrl, fileName: selected.name });
  } catch (failure) { fileError.value = failure.message; }
  finally { reading.value = false; }
}
watch(() => props.bindingKey, () => { text.value = ''; clearImage(); });
watch(() => props.receipt, value => {
  if (value?.status === 'sent' || value?.status === 'submitted') { text.value = ''; clearImage(); }
});
onBeforeUnmount(clearImage);
</script>

<template>
  <section class="wx-work-composer surface">
    <div class="wx-work-section-title"><h2>发送</h2><span v-if="target" class="wx-work-recipient">{{ target.displayName || target.id }}</span></div>
    <div class="wx-work-tabs" role="tablist" aria-label="消息类型"><button type="button" role="tab" :aria-selected="mode === 'text'" :class="{ selected: mode === 'text' }" @click="mode = 'text'">文字</button><button type="button" role="tab" :aria-selected="mode === 'image'" :class="{ selected: mode === 'image' }" @click="mode = 'image'">图片</button></div>
    <template v-if="capability">
      <textarea v-if="mode === 'text'" v-model="text" class="wx-work-message" aria-label="消息" placeholder="消息" :disabled="busy" maxlength="1024"></textarea>
      <div v-else class="wx-work-image-draft"><input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" class="sr-only" aria-label="选择图片" :disabled="busy" @change="pickImage" /><div v-if="file" class="wx-work-image-preview"><img :src="preview" :alt="file.name" /><span>{{ file.name }}</span><button type="button" class="wx-work-icon-button" aria-label="移除图片" :disabled="busy" @click="clearImage"><X :size="16" /></button></div><button v-else type="button" class="wx-work-image-pick" :disabled="busy" @click="fileInput?.click()"><ImagePlus :size="25" />选择图片</button></div>
    </template>
    <p v-else class="wx-work-empty">{{ mode === 'text' ? '文字发送暂不可用' : '图片发送暂不可用' }}</p>
    <p v-if="fileError || error" class="wx-work-error" role="alert">{{ fileError || error }}</p>
    <p v-else-if="mode === 'text' && textInvalid" class="wx-work-error" role="alert">文字上限为 1024 UTF-8 字节</p>
    <div class="wx-work-compose-footer"><span class="wx-work-receipt" aria-live="polite">{{ receiptLabel }}</span><button class="button button-primary" :disabled="!ready" @click="submit"><Send :size="15" />{{ busy ? '发送中' : '发送' }}</button></div>
  </section>
</template>
