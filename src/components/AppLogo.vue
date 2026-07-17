<template>
  <image :class="['app-logo', { compact }]" src="/static/app-logo.png" mode="aspectFit" />
</template>

<script setup>
defineProps({ compact:{ type:Boolean, default:false } })
</script>

<style scoped>
.app-logo{display:block;width:88px;height:88px;border:1px solid rgba(88,86,224,.16);border-radius:22px;background:#fff;box-shadow:0 14px 30px rgba(88,86,224,.22)}
.app-logo.compact{width:72px;height:72px;border-radius:20px}
</style>
