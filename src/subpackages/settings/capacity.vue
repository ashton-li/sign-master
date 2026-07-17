<template>
  <PageShell :tab="false">
    <view class="capacity-page">
      <view class="usage-band">
        <view class="usage-ring" :style="ringStyle"><view class="ring-center"><text>{{ report.percent.toFixed(0) }}%</text><text>已使用</text></view></view>
        <view class="usage-copy"><text class="usage-title">本机文件空间</text><text class="usage-value">{{ formatBytes(report.fileUsed) }} / {{ formatBytes(report.fileLimit) }}</text><text class="usage-available">剩余 {{ formatBytes(report.fileAvailable) }}</text></view>
      </view>

      <view class="section">
        <view class="section-head"><text>使用量明细</text><text>文件沙箱</text></view>
        <view v-for="item in visibleCategories" :key="item.key" class="detail-row">
          <view class="detail-label"><view class="detail-dot" :class="item.key" /><text>{{ item.label }}</text></view>
          <text>{{ formatBytes(item.bytes) }}</text>
        </view>
      </view>

      <view class="storage-note">
        <text class="note-title">小程序键值存储</text>
        <text>{{ formatBytes(report.storage.used) }} / {{ formatBytes(report.storage.limit) }}</text>
        <view class="note-progress"><view :style="{ width: storagePercent + '%' }" /></view>
        <text class="note-desc">签名图片、模板和文件保存在文件沙箱；设置项同时使用微信键值存储。</text>
      </view>

      <view class="temporary-panel">
        <view><text>临时文件</text><text>未完成的文件导入、扫描裁切和处理中间文件</text></view>
        <text>{{ formatBytes(temporaryBytes) }}</text>
      </view>
      <button class="temporary-button" @click="handleTemporaryCleanup"><SvgIcon name="trash" :size="20" /><text>清理临时文件</text></button>

      <button class="cleanup-button" @click="handleCleanup"><SvgIcon name="trash" :size="21" color="#ffffff" /><text>一键清理可再生成数据</text></button>
      <text class="cleanup-desc">清理临时文件、导出副本、缩略图缓存和本机备份，不删除源文件、签名与模板。清理备份前请先将备份发送到微信。</text>
    </view>
  </PageShell>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { clearCleanableData, clearTemporaryFiles, formatBytes, getCapacityReport } from '../../core/storage/capacity'

const report = ref(getCapacityReport())
const visibleCategories = computed(() => report.value.categories.filter((item) => item.bytes > 0 || ['documents', 'exports', 'signatures', 'templates'].includes(item.key)))
const ringStyle = computed(() => ({ background: `conic-gradient(#5856e0 ${report.value.percent}%, #dfe2eb 0)` }))
const storagePercent = computed(() => report.value.storage.limit ? Math.min(100, report.value.storage.used / report.value.storage.limit * 100) : 0)
const temporaryBytes = computed(() => report.value.categories.find((item) => item.key === 'temporary')?.bytes || 0)

function refresh() { report.value = getCapacityReport() }
onShow(refresh)

function handleCleanup() {
  uni.showModal({
    title: '清理可再生成数据？',
    content: '将删除临时文件、导出副本、缩略图缓存和本机备份。源文件、签名和模板不会被删除。',
    confirmText: '确认清理',
    confirmColor: '#e74c5e',
    success: ({ confirm }) => {
      if (!confirm) return
      const released = clearCleanableData()
      refresh()
      uni.showToast({ title: released ? `已释放 ${formatBytes(released)}` : '暂无可清理数据', icon: 'none' })
    }
  })
}

function handleTemporaryCleanup() {
  uni.showModal({
    title: '清理临时文件？',
    content: '将删除已放弃的导入、扫描裁切和处理中间文件，不影响已保存内容。',
    confirmText: '立即清理',
    confirmColor: '#d86a2f',
    success: ({ confirm }) => {
      if (!confirm) return
      const released = clearTemporaryFiles()
      refresh()
      uni.showToast({ title: released ? `已释放 ${formatBytes(released)}` : '暂无临时文件', icon: 'none' })
    }
  })
}
</script>

<style scoped>
.capacity-page{min-height:100vh;box-sizing:border-box;margin:-12px -18px 0;padding:18px 18px calc(32px + env(safe-area-inset-bottom));background:var(--color-bg)}.usage-band{display:flex;align-items:center;gap:22px;padding:22px 18px;color:#fff;border-radius:8px;background:#242936}.usage-ring{display:flex;width:112px;height:112px;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%}.ring-center{display:flex;width:82px;height:82px;flex-direction:column;align-items:center;justify-content:center;border-radius:50%;background:#242936}.ring-center text:first-child{font-size:24px;font-weight:900}.ring-center text:last-child{margin-top:2px;color:#bfc4d0;font-size:10px}.usage-copy{display:flex;min-width:0;flex-direction:column}.usage-title{font-size:17px;font-weight:900}.usage-value{margin-top:9px;font-size:13px;font-weight:800}.usage-available{margin-top:5px;color:#9ee2bd;font-size:11px}.section,.storage-note{margin-top:14px;padding:16px;border:1px solid rgba(30,34,45,.07);border-radius:8px;background:var(--color-surface)}.section-head,.detail-row{display:flex;align-items:center;justify-content:space-between}.section-head{padding-bottom:10px;color:var(--color-ink);font-size:14px;font-weight:900;border-bottom:1px solid var(--color-divider)}.section-head text:last-child{color:var(--color-tertiary);font-size:10px}.detail-row{min-height:43px;color:var(--color-muted);font-size:11px;border-bottom:1px solid var(--color-divider)}.detail-row:last-child{border-bottom:0}.detail-label{display:flex;align-items:center;gap:9px}.detail-dot{width:9px;height:9px;border-radius:2px;background:#8f95a5}.detail-dot.documents{background:#5856e0}.detail-dot.exports{background:#2b9b62}.detail-dot.thumbnails{background:#e2a536}.detail-dot.signatures{background:#db5778}.detail-dot.templates{background:#3f8bbd}.detail-dot.projects{background:#875ab8}.detail-dot.temporary{background:#d86a2f}.note-title{display:block;color:var(--color-ink);font-size:14px;font-weight:900}.storage-note>text:nth-child(2){display:block;margin-top:6px;color:var(--color-muted);font-size:11px}.note-progress{height:8px;margin-top:10px;overflow:hidden;border-radius:4px;background:#e2e4eb}.note-progress view{height:100%;border-radius:4px;background:#2b9b62}.note-desc{display:block;margin-top:10px;color:var(--color-tertiary);font-size:10px;line-height:17px}.temporary-panel{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:14px 16px;border:1px solid rgba(216,106,47,.2);border-radius:8px;background:var(--color-surface)}.temporary-panel>view{display:flex;min-width:0;flex-direction:column}.temporary-panel>view text:first-child{color:var(--color-ink);font-size:13px;font-weight:900}.temporary-panel>view text:last-child{margin-top:4px;color:var(--color-tertiary);font-size:9px;line-height:14px}.temporary-panel>text{flex-shrink:0;color:#c15f2b;font-size:12px;font-weight:900}.temporary-button,.cleanup-button{display:flex;width:100%;height:50px;align-items:center;justify-content:center;gap:9px;font-size:14px;font-weight:900;border-radius:8px}.temporary-button{margin-top:10px;color:#a94e23;border:1px solid rgba(216,106,47,.35);background:#fff7f1}.cleanup-button{margin-top:12px;color:#fff;background:#d94f5f}.temporary-button::after,.cleanup-button::after{display:none}.cleanup-desc{display:block;margin-top:9px;padding:0 6px;color:var(--color-tertiary);font-size:10px;line-height:17px;text-align:center}
</style>
