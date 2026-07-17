<template>
  <view class="bottom-nav">
    <button
      v-for="item in leftItems"
      :key="item.key"
      :class="['nav-btn', { active: active === item.key }]"
      @click="handleSwitch(item)"
    >
      <SvgIcon :name="item.icon" :size="21" :color="active === item.key ? '#5856e0' : '#9a9dad'" />
      <text>{{ item.label }}</text>
    </button>

    <view class="center-wrap">
      <button class="center-action" @click="handleStartSign">
        <view class="center-icon"><SvgIcon name="sign" :size="29" color="#ffffff" /></view>
        <text>签署</text>
      </button>
    </view>

    <button
      v-for="item in rightItems"
      :key="item.key"
      :class="['nav-btn', { active: active === item.key }]"
      @click="handleSwitch(item)"
    >
      <SvgIcon :name="item.icon" :size="21" :color="active === item.key ? '#5856e0' : '#9a9dad'" />
      <text>{{ item.label }}</text>
    </button>
  </view>
</template>

<script setup>
import SvgIcon from './SvgIcon.vue'
import { writeLocal } from '../core/storage/localRepository'
import { useSigningStore } from '../stores/signing'

defineProps({
  active: {
    type: String,
    default: 'home'
  }
})

const signingStore = useSigningStore()

const leftItems = [
  { key: 'home', label: '文件', icon: 'file', path: '/pages/home/index' },
  { key: 'templates', label: '模板', icon: 'template', path: '/pages/templates/index' }
]

const rightItems = [
  { key: 'signatures', label: '签名', icon: 'signatureLibrary', path: '/pages/signatures/index' },
  { key: 'settings', label: '我的', icon: 'settings', path: '/pages/settings/index' }
]

function handleSwitch(item) {
  uni.switchTab({
    url: item.path
  })
}

function handleStartSign() {
  writeLocal('home-guide-seen', true)
  signingStore.resetFlow()
  uni.navigateTo({
    url: '/pages/sign/index'
  })
}
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: 1fr 1fr 1.28fr 1fr 1fr;
  align-items: center;
  height: calc(76px + env(safe-area-inset-bottom));
  padding: 7px 16px calc(8px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.78);
  border-top: 1px solid rgba(218, 222, 233, 0.7);
  box-shadow: 0 -8px 24px rgba(55, 58, 73, 0.04);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 52px;
  color: var(--color-tertiary);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.nav-btn.active {
  color: var(--color-brand);
  font-weight: 900;
}

.center-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 62px;
}

.center-action{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:68px;height:66px;color:var(--color-brand);font-size:10px;font-weight:900}.center-icon{display:flex;align-items:center;justify-content:center;width:50px;height:50px;border-radius:50%;background:linear-gradient(145deg,#817eff,#514fda);box-shadow:0 8px 22px rgba(88,86,224,.38),inset 0 1px 0 rgba(255,255,255,.35)}.center-action:active .center-icon{transform:scale(.92)}
:global(.theme-dark) .bottom-nav{border-top-color:rgba(255,255,255,.07);background:rgba(25,26,34,.94);box-shadow:0 -8px 24px rgba(0,0,0,.18)}
</style>
