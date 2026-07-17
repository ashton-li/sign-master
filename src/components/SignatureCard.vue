<template>
  <GlassCard class="signature-card" :class="{ add: signature.add }" @click="handleClick">
    <template v-if="signature.add">
      <view class="add-symbol">+</view>
      <text class="add-text">添加签名</text>
    </template>
    <template v-else>
      <view class="signature-preview">
        <text
          class="signature-name"
          :style="{
            color: signature.color,
            fontSize: `${signature.size}rpx`,
            transform: `rotate(${signature.rotate}deg)`
          }"
        >
          {{ signature.name }}
        </text>
      </view>
      <view class="signature-footer">
        <text class="signature-label">{{ signature.label }}</text>
        <text class="signature-choose">选择</text>
      </view>
    </template>
  </GlassCard>
</template>

<script setup>
import GlassCard from './GlassCard.vue'

const props = defineProps({
  signature: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['click'])

function handleClick() {
  emit('click', props.signature)
}
</script>

<style scoped>
.signature-card {
  min-height: 230rpx;
  padding: 18rpx;
}

.signature-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 142rpx;
  border-radius: 24rpx;
  background: linear-gradient(145deg, rgba(88, 86, 224, 0.08), rgba(255, 255, 255, 0.18));
  border: 1px dashed rgba(88, 86, 224, 0.18);
}

.signature-name {
  font-family: 'KaiTi', 'STKaiti', 'PingFang SC', cursive, serif;
  font-weight: 700;
  letter-spacing: 6rpx;
  white-space: nowrap;
}

.signature-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 4rpx 0;
}

.signature-label {
  padding: 6rpx 16rpx;
  color: var(--color-brand);
  font-size: 18rpx;
  font-weight: 800;
  border-radius: 999rpx;
  background: var(--color-brand-soft);
}

.signature-choose {
  color: var(--color-tertiary);
  font-size: 20rpx;
  font-weight: 700;
}

.signature-card.add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  color: var(--color-brand);
  border-style: dashed;
}

.add-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 86rpx;
  height: 86rpx;
  font-size: 54rpx;
  font-weight: 300;
  border-radius: 999rpx;
  background: var(--color-brand-soft);
}

.add-text {
  font-size: 22rpx;
  font-weight: 800;
}
</style>
