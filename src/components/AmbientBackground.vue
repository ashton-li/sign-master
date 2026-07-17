<template>
  <!-- #ifdef H5 -->
  <view class="ambient-root">
    <view class="orb orb-1" />
    <view class="orb orb-2" />
    <view class="orb orb-3" />
    <view class="particles">
      <view v-for="item in 8" :key="item" class="particle" :class="`particle-${item}`" />
    </view>
  </view>
  <!-- #endif -->
</template>

<style scoped>
.ambient-root {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.orb {
  position: absolute;
  border-radius: 9999px;
  filter: blur(80px);
  opacity: 0.5;
  animation: orbFloat 16s ease-in-out infinite;
  will-change: transform;
}

.orb-1 {
  top: -10%;
  left: -15%;
  width: 680rpx;
  height: 680rpx;
  background: radial-gradient(circle, rgba(120, 100, 240, 0.5), transparent 70%);
}

.orb-2 {
  right: -18%;
  bottom: -12%;
  width: 560rpx;
  height: 560rpx;
  background: radial-gradient(circle, rgba(80, 180, 220, 0.4), transparent 70%);
  animation-delay: -5s;
  animation-duration: 18s;
}

.orb-3 {
  top: 40%;
  left: 55%;
  width: 400rpx;
  height: 400rpx;
  background: radial-gradient(circle, rgba(200, 120, 220, 0.35), transparent 70%);
  animation-delay: -9s;
  animation-duration: 20s;
}

.particle {
  position: absolute;
  bottom: -20rpx;
  width: 4rpx;
  height: 4rpx;
  border-radius: 9999px;
  background: var(--color-brand-bright);
  opacity: 0;
  animation: particleRise 8s ease-in infinite;
}

.particle-1 {
  left: 15%;
}
.particle-2 {
  left: 28%;
  animation-delay: 1.6s;
}
.particle-3 {
  left: 39%;
  animation-delay: 3s;
}
.particle-4 {
  left: 52%;
  animation-delay: 4.4s;
}
.particle-5 {
  left: 66%;
  animation-delay: 1s;
}
.particle-6 {
  left: 74%;
  animation-delay: 2.8s;
}
.particle-7 {
  left: 84%;
  animation-delay: 5s;
}
.particle-8 {
  left: 92%;
  animation-delay: 3.8s;
}
</style>
