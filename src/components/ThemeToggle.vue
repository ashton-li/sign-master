<template>
  <view class="theme-toggle" :class="{ dark: activeDark }">
    <view class="toggle-thumb" />
  </view>
</template>

<script setup>
defineProps({
  activeDark: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
.theme-toggle {
  width: 92rpx;
  height: 50rpx;
  padding: 5rpx;
  border-radius: 999rpx;
  background: rgba(144, 147, 165, 0.25);
  border: 1px solid var(--glass-border);
  transition: background 180ms ease;
}

.theme-toggle.dark {
  background: var(--color-brand);
}

.toggle-thumb {
  width: 38rpx;
  height: 38rpx;
  border-radius: 999rpx;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.18);
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.theme-toggle.dark .toggle-thumb {
  transform: translateX(42rpx);
}
</style>
