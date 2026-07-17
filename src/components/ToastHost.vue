<template>
  <view v-if="visible" class="toast-pop">
    <text class="toast-check">✓</text>
    <text>{{ message }}</text>
  </view>
</template>

<script setup>
import { useToast } from '../composables/useToast'

const { visible, message } = useToast()
</script>

<style scoped>
.toast-pop {
  position: fixed;
  top: 30rpx;
  left: 50%;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 8rpx;
  max-width: 620rpx;
  padding: 18rpx 32rpx;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 700;
  white-space: nowrap;
  background: #1a1c26;
  border-radius: 40rpx;
  box-shadow: 0 16rpx 56rpx rgba(0, 0, 0, 0.36);
  transform: translateX(-50%);
}

.toast-check {
  color: #9d9bff;
}
</style>
