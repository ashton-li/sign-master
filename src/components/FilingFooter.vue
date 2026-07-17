<template>
  <button class="filing" @click="handleOpen">闽ICP备2026014225号-3X</button>
</template>

<script setup>
const filingUrl = 'https://beian.miit.gov.cn/'

function handleOpen() {
  // #ifdef H5
  window.open(filingUrl, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifdef MP-WEIXIN
  uni.setClipboardData({ data:filingUrl, success:() => uni.showToast({ title:'查询网址已复制', icon:'none' }) })
  // #endif
}
</script>

<style scoped>
.filing{display:flex;width:auto;height:32px;align-items:center;justify-content:center;margin:12px auto 0;padding:0 8px;color:var(--color-tertiary);font-size:10px;line-height:1;text-decoration:underline;background:transparent}
</style>
