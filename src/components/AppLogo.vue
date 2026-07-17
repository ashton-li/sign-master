<template>
  <view :class="['app-logo', { compact }]">
    <SvgIcon name="sign" :size="compact ? 30 : 42" color="#ffffff" />
  </view>
</template>

<script setup>
import SvgIcon from './SvgIcon.vue'

defineProps({ compact:{ type:Boolean, default:false } })
</script>

<style scoped>
.app-logo{display:flex;width:88px;height:88px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.58);border-radius:24px;background:linear-gradient(135deg,#b4b1ff,#8f8cff 48%,#7b76ff);box-shadow:0 14px 30px rgba(88,86,224,.27)}
.app-logo.compact{width:72px;height:72px;border-radius:23px}
</style>
