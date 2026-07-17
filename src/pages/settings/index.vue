<template>
  <PageShell active="settings">
    <view class="settings-heading"><text class="ref-page-title">设置</text></view>
    <view class="settings-list soft-card">
      <button class="setting-row" @click="handleThemeToggle"><view class="setting-left"><view class="setting-icon moon"><SvgIcon name="moon" :size="18" /></view><view><text class="setting-title">外观主题</text><text class="setting-desc">{{ themeStore.themeLabel }}</text></view></view><view :class="['mode-indicator', themeStore.mode]" /></button>
      <button class="setting-row" @click="handleNotification"><view class="setting-left"><view class="setting-icon bell"><SvgIcon name="bell" :size="18" /></view><text class="setting-title">完成提醒</text></view><view :class="['switch-control',{ on: notificationEnabled }]"><view class="switch-thumb" /></view></button>
      <button class="setting-row" @click="handleSaveSignedFiles"><view class="setting-left"><view class="setting-icon save"><SvgIcon name="save" :size="18" /></view><view><text class="setting-title">保存签署后的文件</text><text class="setting-desc">导出后显示在文件页</text></view></view><view :class="['switch-control',{ on: saveSignedFiles }]"><view class="switch-thumb" /></view></button>
      <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/settings/backup')"><view class="setting-left"><view class="setting-icon backup"><SvgIcon name="archive" :size="18" color="#7a4b13" /></view><view><text class="setting-title">备份与恢复</text><text class="setting-desc">清理缓存前发送完整备份到微信</text></view></view><text class="chevron">›</text></button>
      <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/settings/capacity')"><view class="setting-left"><view class="setting-icon capacity"><SvgIcon name="capacity" :size="18" color="#306d9d" /></view><view><text class="setting-title">容量管理</text><text class="setting-desc">查看使用明细与清理可再生成数据</text></view></view><text class="chevron">›</text></button>
        <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/security/verify')"><view class="setting-left"><view class="setting-icon security"><SvgIcon name="shield" :size="18" /></view><view><text class="setting-title">签字鉴别</text><text class="setting-desc">上传签署文件，核验系统来源与用户归属</text></view></view><text class="chevron">›</text></button>
      <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/settings/about')"><view class="setting-left"><view class="setting-icon pin"><SvgIcon name="pin" :size="18" /></view><text class="setting-title">关于</text></view><text class="setting-value">签字大师 {{ appVersion }} ›</text></button>
      <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/settings/help')"><view class="setting-left"><view class="setting-icon chat"><SvgIcon name="chat" :size="18" /></view><text class="setting-title">帮助与反馈</text></view><text class="chevron">›</text></button>
      <button class="setting-row" :disabled="navigating" @click="handleNavigate('/subpackages/settings/privacy')"><view class="setting-left"><view class="setting-icon lock"><SvgIcon name="lock" :size="18" /></view><text class="setting-title">隐私说明</text></view><text class="chevron">›</text></button>
    </view>
    <view class="data-note"><text>数据不上传服务器；清除小程序数据前请先生成完整备份。</text></view>
  </PageShell>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { syncCustomTabBar } from '../../core/navigation/customTabBar'
import { readLocal, writeLocal } from '../../core/storage/localRepository'
import { useThemeStore } from '../../stores/theme'

const themeStore = useThemeStore()
const notificationEnabled = ref(readLocal('notification-enabled', true))
const saveSignedFiles = ref(readLocal('save-signed-files', true))
const navigating = ref(false)
const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'
onShow(() => { navigating.value = false; syncCustomTabBar(3) })
function handleThemeToggle() { themeStore.toggle() }
function handleNotification() { notificationEnabled.value = !notificationEnabled.value; writeLocal('notification-enabled', notificationEnabled.value) }
function handleSaveSignedFiles() {
  if (!saveSignedFiles.value) {
    saveSignedFiles.value = true
    writeLocal('save-signed-files', true)
    return
  }
  uni.showModal({
    title: '关闭文件保存？',
    content: '关闭后仍会生成导出文件，但不会显示在“已签署文件”中。',
    confirmText: '确认关闭',
    confirmColor: '#e74c5e',
    success: ({ confirm }) => {
      if (!confirm) return
      saveSignedFiles.value = false
      writeLocal('save-signed-files', false)
    }
  })
}
function handleNavigate(url) {
  if (navigating.value) return
  navigating.value = true
  uni.navigateTo({ url, fail: () => { navigating.value = false } })
}
</script>

<style scoped>
.settings-heading { margin: 3px 0 11px; }.settings-list { overflow: hidden; }.setting-row { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 62px; padding: 8px 17px; border-bottom: 1px solid rgba(0,0,0,.06); }.setting-row:last-child { border-bottom: 0; }.setting-left { display: flex; align-items: center; gap: 13px; text-align: left; }.setting-left>view:not(.setting-icon) { display: flex; flex-direction: column; }.setting-icon { display: flex; align-items: center; justify-content: center; width: 31px; height: 31px; border-radius: 9px; }.moon { color:#7659df;background:#f0ebff }.pin { color:#e94473;background:#fff0f4 }.bell { color:#d38a18;background:#fff5e2 }.chat { color:#5b72d8;background:#edf0ff }.lock { color:#318c54;background:#eaf8ee }.setting-title { color:var(--color-ink);font-size:14px;font-weight:800 }.setting-desc { margin-top:4px;color:var(--color-tertiary);font-size:10px }.setting-value,.chevron { color:var(--color-tertiary);font-size:11px }.chevron { font-size:18px }.switch-control { position:relative;width:44px;height:26px;border-radius:999px;background:#d0d3dc;transition:background .2s }.switch-control.on { background:var(--color-brand) }.switch-thumb { position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s }.switch-control.on .switch-thumb { transform:translateX(18px) }.mode-indicator { width:25px;height:25px;border:6px solid #b8bdc9;border-radius:50%; }.mode-indicator.dark { background:#252735;border-color:#5856e0 }.mode-indicator.light { background:#ffd65a;border-color:#fff0aa }.data-note { margin-top:14px;color:var(--color-tertiary);font-size:10px;line-height:16px;text-align:center }.panel-mask { position:fixed;inset:0;z-index:100;display:flex;align-items:flex-end;background:rgba(0,0,0,.36) }.info-panel { width:100%;padding:18px 20px calc(18px + env(safe-area-inset-bottom));border-radius:18px 18px 0 0;background:var(--color-surface) }.panel-head { display:flex;align-items:center;justify-content:space-between;color:var(--color-ink);font-size:17px;font-weight:900 }.panel-head button { width:30px;height:30px;color:var(--color-tertiary);font-size:22px }.panel-body { display:block;margin-top:14px;color:var(--color-muted);font-size:12px;line-height:20px }.panel-confirm { width:100%;height:42px;margin-top:18px;color:#fff;font-size:13px;font-weight:900;border-radius:10px;background:var(--color-brand) }
.setting-icon.save{color:#167743;background:#e9f8ee}.setting-icon.security{color:#315acb;background:#edf2ff}.setting-icon.backup{background:#fff4dc}.setting-icon.capacity{background:#e9f4fb}.setting-row[disabled]{opacity:.72}
</style>
