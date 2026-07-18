<template>
  <PageShell active="home">
    <view class="home-hero">
      <view class="brand-halo"><AppLogo compact /></view>
      <text class="hero-title">签字大师</text>
      <text class="hero-subtitle">signMaster · 光之笔触</text>
    </view>

    <view class="ref-title-row file-heading">
      <text class="ref-page-title">已签署文件</text>
      <text class="count-pill">{{ filesStore.count }} 份</text>
    </view>

    <view v-if="filesStore.files.length" class="file-list">
      <view v-for="file in filesStore.files" :key="file.id" class="file-wrap" @touchstart="handleTouchStart(file)" @touchend="handleTouchEnd" @touchcancel="handleTouchEnd">
        <FileCard :file="file" @click="handleFileClick(file)" />
        <button class="delete-file" @click.stop="handleDelete(file)"><SvgIcon name="minus" :size="16" color="#ffffff" /></button>
      </view>
    </view>

    <view v-else :class="['home-empty',{ guided:firstUse }]">
      <view class="empty-pulse"><view class="empty-doc"><SvgIcon name="signatureLibrary" :size="30" color="#ffffff" /></view></view>
      <text class="empty-primary">点击下方“签署”开始</text>
      <text class="empty-secondary">导入文件并完成你的第一次签署</text>
      <view class="guide-arrow" aria-label="指向下方签署按钮"><SvgIcon name="arrowDown" :size="38" color="#5856e0" /></view>
    </view>
  </PageShell>
</template>

<script setup>
import { ref } from 'vue'
import { onPullDownRefresh, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import FileCard from '../../components/FileCard.vue'
import AppLogo from '../../components/AppLogo.vue'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { useMiniProgramShare } from '../../composables/useMiniProgramShare'
import { syncCustomTabBar } from '../../core/navigation/customTabBar'
import { readLocal } from '../../core/storage/localRepository'
import { useFilesStore } from '../../stores/files'

const filesStore = useFilesStore()
const miniProgramShare = useMiniProgramShare('home')
const firstUse = ref(!readLocal('home-guide-seen', false))
const suppressedFileId = ref('')
let longPressTimer = null

onShareAppMessage(miniProgramShare.friendShare)
onShareTimeline(miniProgramShare.timelineShare)

onShow(() => {
  syncCustomTabBar(0)
  firstUse.value = !readLocal('home-guide-seen', false)
})
onPullDownRefresh(() => {
  filesStore.reload()
  uni.stopPullDownRefresh()
})

function handleFileClick(file) {
  if (suppressedFileId.value === file.id) return
  if (file.projectRef) {
    uni.navigateTo({ url: `/pages/sign/edit?fileId=${encodeURIComponent(file.id)}` })
    return
  }
  if (file.path && file.kind === 'pdf') {
    uni.openDocument({ filePath: file.path, showMenu: true })
    return
  }
  if (file.path) uni.previewImage({ urls: [file.path], current: file.path })
}

function handleDelete(file) {
  uni.showModal({
    title: '删除文件',
    content: `确认删除“${file.name}”？删除后无法恢复。`,
    confirmColor: '#e74c5e',
    success: ({ confirm }) => { if (confirm) filesStore.removeFile(file.id) }
  })
}

function handleTouchStart(file) {
  handleTouchEnd()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    suppressedFileId.value = file.id
    handleDelete(file)
    setTimeout(() => { if (suppressedFileId.value === file.id) suppressedFileId.value = '' }, 800)
  }, 550)
}

function handleTouchEnd() {
  if (longPressTimer) clearTimeout(longPressTimer)
  longPressTimer = null
}
</script>

<style scoped>
.home-hero{display:flex;height:142px;flex-direction:column;align-items:center;padding-top:7px}.brand-halo{position:relative;display:flex;width:112px;height:88px;align-items:center;justify-content:center}.brand-halo::before,.brand-halo::after{position:absolute;top:-12px;width:108px;height:108px;content:"";border:2px solid rgba(124,122,255,.08);border-radius:32px;box-shadow:0 0 28px rgba(88,86,224,.13)}.brand-halo::after{top:-4px;width:84px;height:84px;border-radius:28px;background:rgba(88,86,224,.04)}.brand-halo :deep(.app-logo){position:relative;z-index:2}.hero-title{color:var(--color-ink);font-size:22px;font-weight:900;line-height:26px}.hero-subtitle{margin-top:2px;color:var(--color-tertiary);font-size:11px;font-weight:600;line-height:14px}.file-heading{margin-top:3px;margin-bottom:10px}.file-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.file-wrap{position:relative;min-width:0;height:184px}.delete-file{position:absolute;right:-6px;top:-6px;z-index:8;display:flex;width:28px;height:28px;align-items:center;justify-content:center;border:3px solid var(--color-bg);border-radius:50%;background:#e74c5e;box-shadow:0 3px 9px rgba(231,76,94,.28)}.home-empty{display:flex;min-height:270px;flex-direction:column;align-items:center;justify-content:center;color:var(--color-tertiary);text-align:center}.empty-pulse{position:relative;display:flex;width:82px;height:82px;align-items:center;justify-content:center}.empty-pulse::before,.empty-pulse::after{position:absolute;inset:8px;content:"";border:1px solid rgba(88,86,224,.22);border-radius:50%}.guided .empty-pulse::before{animation:guidePulse 1.8s ease-out infinite}.guided .empty-pulse::after{animation:guidePulse 1.8s .45s ease-out infinite}.empty-doc{position:relative;z-index:2;display:flex;width:56px;height:56px;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.72);border-radius:16px;background:#5856e0;box-shadow:0 8px 20px rgba(88,86,224,.28)}.empty-primary{margin-top:10px;color:var(--color-ink);font-size:17px;font-weight:900;line-height:24px}.empty-secondary{margin-top:6px;font-size:11px;line-height:17px}.guide-arrow{display:flex;margin-top:18px;animation:guideDown 1.15s ease-in-out infinite}@keyframes guidePulse{0%{opacity:.8;transform:scale(.72)}100%{opacity:0;transform:scale(1.28)}}@keyframes guideDown{0%,100%{transform:translateY(-3px)}50%{transform:translateY(7px)}}
.brand-halo::before{animation:brandHalo 2.8s ease-out infinite}.brand-halo::after{animation:brandHalo 2.8s .9s ease-out infinite}.brand-halo :deep(.app-logo){animation:brandFloat 2.7s ease-in-out infinite}.empty-pulse::before{animation:guidePulse 2.15s ease-out infinite}.empty-pulse::after{animation:guidePulse 2.15s .58s ease-out infinite}.empty-doc{transform:none}.guide-arrow{display:flex;width:52px;height:48px;align-items:center;justify-content:center;margin-top:11px;color:var(--color-brand);filter:drop-shadow(0 5px 6px rgba(88,86,224,.28));animation:guideDown 1.05s ease-in-out infinite}@keyframes brandHalo{0%{opacity:.72;transform:scale(.78)}72%,100%{opacity:0;transform:scale(1.14)}}@keyframes brandFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.025)}}@media (prefers-reduced-motion:reduce){.brand-halo::before,.brand-halo::after,.brand-halo :deep(.app-logo),.empty-pulse::before,.empty-pulse::after,.guide-arrow{animation:none}}
</style>
