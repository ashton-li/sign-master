<template>
  <view :class="['file-card', { 'neon-active': file.active }]" @click="handleClick">
    <view class="file-visual">
      <image v-if="thumbnail" class="thumb-image" :src="thumbnail" mode="aspectFill" />
      <view v-else class="thumb-placeholder">
        <SvgIcon :name="thumbIcon" :size="32" />
        <view class="paper-line" /><view class="paper-line short" /><view class="paper-line" />
      </view>
    </view>
    <view class="file-overlay">
      <text class="file-name">{{ file.name }}</text>
      <view class="file-meta"><text>{{ file.date }}</text><text>{{ file.signatures || 0 }} 个签字</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import SvgIcon from './SvgIcon.vue'

const props = defineProps({
  file: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['click'])
const thumbnail = computed(() => {
  if (props.file.thumbnail) return props.file.thumbnail
  return props.file.previewPath || ''
})
const thumbIcon = computed(() => props.file.kind === 'image' ? 'image' : 'file')

function handleClick() {
  emit('click', props.file)
}
</script>

<style scoped>
.file-card{position:relative;width:100%;height:100%;min-height:0;padding:0;overflow:hidden;border:1px solid rgba(88,86,224,.12);border-radius:8px;background:#eef0f6}.file-visual{position:absolute;inset:0;background:#eef0f6}.thumb-image{width:100%;height:100%}.thumb-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--color-brand);background:linear-gradient(145deg,#f6f7fb,#e8eaf3)}.paper-line{width:56%;height:3px;border-radius:999px;background:rgba(88,86,224,.13)}.paper-line.short{width:39%}.file-overlay{position:absolute;right:0;bottom:0;left:0;display:flex;box-sizing:border-box;height:58px;min-height:58px;flex-direction:column;justify-content:center;padding:7px 9px;color:#1a1c26;border-top:1px solid rgba(255,255,255,.68);background:rgba(255,255,255,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.file-name{display:block;overflow:hidden;font-size:12px;font-weight:900;line-height:16px;text-overflow:ellipsis;white-space:nowrap}.file-meta{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:5px;margin-top:4px;color:#676b7d;font-size:8px;font-weight:700}.file-meta text:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.file-meta text:last-child{flex-shrink:0;color:var(--color-brand)}
/* #ifdef MP-WEIXIN */
.file-overlay{background:rgba(255,255,255,.9)}
/* #endif */
</style>
