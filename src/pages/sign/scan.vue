<template>
  <view :class="['scan-page', themeClass]">
    <template v-if="stage === 'camera'">
      <!-- #ifdef MP-WEIXIN -->
      <camera id="documentCamera" class="camera" device-position="back" flash="auto" resolution="high" @error="handleCameraError" />
      <cover-view class="scan-overlay">
        <cover-view class="guide-frame">
          <cover-view class="corner tl" /><cover-view class="corner tr" /><cover-view class="corner bl" /><cover-view class="corner br" />
        </cover-view>
        <cover-view class="scan-status">{{ statusText }}</cover-view>
      </cover-view>
      <cover-view class="camera-actions">
        <cover-view :class="['capture', { disabled:captureBusy }]" hover-class="capture-pressed" @tap.stop="handleCapture">
          <cover-view class="capture-inner" />
        </cover-view>
      </cover-view>
      <!-- #endif -->

      <!-- #ifndef MP-WEIXIN -->
      <view class="camera h5-camera"><SvgIcon name="scan" :size="54" color="#ffffff" /><text>将文稿放入边框，点击拍照</text></view>
      <view class="scan-overlay">
        <view class="guide-frame"><view class="corner tl" /><view class="corner tr" /><view class="corner bl" /><view class="corner br" /></view>
        <text class="scan-status">{{ statusText }}</text>
      </view>
      <view class="camera-actions">
        <button class="capture" :disabled="captureBusy" @click="handleCapture"><view class="capture-inner" /></button>
      </view>
      <!-- #endif -->
    </template>

    <view v-else class="preview-stage">
      <view class="preview-summary">
        <view><text>扫描预览</text><text>{{ previewStatusText }}</text></view>
        <text>{{ scannedPages.length }} 页</text>
      </view>
      <view class="sort-tip"><SvgIcon name="drag" :size="17" /><text>按住右侧手柄上下拖动可调整 PDF 页序</text></view>
      <scroll-view class="preview-list" scroll-y :scroll-with-animation="false">
        <view
          v-for="(page,index) in scannedPages"
          :key="page.id || page.path"
          :class="['page-card',{ dragging:draggingIndex === index, target:dragTarget === index && draggingIndex !== index }]"
        >
          <view class="page-thumb">
            <image :src="page.path" mode="aspectFill" />
            <view v-if="page.status !== 'done'" :class="['crop-progress', page.status]"><text>{{ page.status === 'error' ? '!' : `${page.progress || 0}%` }}</text></view>
          </view>
          <view class="page-copy">
            <text>第 {{ index + 1 }} 页</text><text>{{ page.name }}</text>
            <button v-if="page.status === 'error'" class="retry-crop" @click.stop="handleRetry(page)">重新裁切</button>
            <text v-else :class="['crop-state', page.status]">{{ pageStatusText(page) }}</text>
          </view>
          <button class="delete-page" :disabled="finishBusy" @click.stop="handleDelete(index)"><SvgIcon name="trash" :size="18" color="#d64a55" /></button>
          <view
            class="drag-handle"
            @touchstart.stop="handleDragStart(index,$event)"
            @touchmove.stop.prevent="handleDragMove($event)"
            @touchend.stop="handleDragEnd"
            @touchcancel.stop="handleDragCancel"
          ><SvgIcon name="drag" :size="22" color="#626779" /></view>
        </view>
        <view class="list-spacer" />
      </scroll-view>
      <view class="preview-actions">
        <button class="continue-button" :disabled="captureBusy || finishBusy" @click="handleContinueScan"><SvgIcon name="camera" :size="19" /><text>继续扫描</text></button>
        <button class="finish-button" :disabled="!scannedPages.length || finishBusy || failedCropCount > 0" @click="handleFinish"><SvgIcon name="check" :size="19" color="#ffffff" /><text>{{ finishButtonText }}</text></button>
      </view>
    </view>

    <canvas id="scanProcessCanvas" canvas-id="scanProcessCanvas" class="process-canvas" width="900" height="900" />
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { useTheme } from '../../composables/useTheme'
import { createScanPdfFromPaths } from './scanPdf'
import { savePdfBytes } from '../../core/export/pdfFileSaver'
import { moveScanPage } from '../../core/file/scanPages'
import { discardTemporaryDocument, persistLocalFile, pickDocumentSource, removeManagedFile } from '../../core/file/sourcePicker'
import { scanDocumentImage } from '../../core/vision/documentScanner'

const instance = getCurrentInstance()
const { themeClass } = useTheme()
const stage = ref('camera')
const captureBusy = ref(false)
const finishBusy = ref(false)
const cameraError = ref('')
const scannedPages = ref([])
const draggingIndex = ref(-1)
const dragTarget = ref(-1)
let dragStartY = 0
let eventChannel = null
let cameraContext = null
let cancelled = false
let scanCompleted = false
let cropQueue = Promise.resolve()
const scanSources = new Map()

const pendingCropCount = computed(() => scannedPages.value.filter((page) => page.status === 'queued' || page.status === 'processing').length)
const failedCropCount = computed(() => scannedPages.value.filter((page) => page.status === 'error').length)
const previewStatusText = computed(() => {
  if (failedCropCount.value) return `${failedCropCount.value} 页裁切失败，可点击重试`
  if (pendingCropCount.value) return `${pendingCropCount.value} 页正在后台裁切，可继续拍摄`
  return '文档边沿识别与自动裁切已完成'
})
const finishButtonText = computed(() => {
  if (finishBusy.value && pendingCropCount.value) return '等待裁切…'
  if (finishBusy.value) return '正在生成…'
  return '完成扫描'
})

const statusText = computed(() => {
  if (captureBusy.value) return '正在保存照片…'
  if (cameraError.value) return cameraError.value
  return '将整张纸放入辅助框内，点击拍照'
})

onLoad(() => {
  const pages = getCurrentPages()
  eventChannel = pages[pages.length - 1]?.getOpenerEventChannel?.()
})

onReady(setupCameraContext)
onUnload(() => {
  cancelled = true
  if (!scanCompleted) scannedPages.value.forEach((page) => discardTemporaryDocument(page, uni))
  scanSources.clear()
})

function setupCameraContext() {
  // #ifdef MP-WEIXIN
  cameraContext = typeof uni.createCameraContext === 'function' ? uni.createCameraContext() : wx.createCameraContext()
  // #endif
}

async function acquirePhoto() {
  // #ifdef MP-WEIXIN
  if (!cameraContext) setupCameraContext()
  const result = await new Promise((resolve, reject) => cameraContext.takePhoto({ quality:'high', success:resolve, fail:reject }))
  return { id:`scan-${Date.now()}`, name:`扫描文稿-${scannedPages.value.length + 1}.jpg`, path:result.tempImagePath, source:'scan', kind:'image', extension:'jpg', size:0 }
  // #endif
  // #ifndef MP-WEIXIN
  return pickDocumentSource('scan', { uniApi:uni, persist:false })
  // #endif
}

async function handleCapture() {
  if (captureBusy.value || finishBusy.value || cancelled) return
  captureBusy.value = true
  try {
    const original = await acquirePhoto()
    if (!original?.path || cancelled) return
    const pageId = `scan-page-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    const pendingPage = {
      ...original,
      id:pageId,
      originalPath:original.path,
      status:'queued',
      progress:2,
      progressLabel:'等待裁切'
    }
    scanSources.set(pageId, original)
    scannedPages.value = [...scannedPages.value, pendingPage]
    stage.value = 'preview'
    uni.vibrateShort?.({ type:'light' })
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 16))
    queueCrop(pageId, original)
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (!cancelled && !/cancel/i.test(message)) uni.showModal({ title:'扫描失败', content:message || '无法处理照片', showCancel:false })
  } finally {
    captureBusy.value = false
  }
}

function patchPage(pageId, changes) {
  let changed = false
  scannedPages.value = scannedPages.value.map((page) => {
    if (page.id !== pageId) return page
    changed = true
    return { ...page, ...changes }
  })
  return changed
}

function hasPage(pageId) {
  return scannedPages.value.some((page) => page.id === pageId)
}

function queueCrop(pageId, source) {
  patchPage(pageId, { status:'queued', progress:2, progressLabel:'等待裁切', errorText:'' })
  cropQueue = cropQueue.catch(() => {}).then(async () => {
    if (cancelled || !hasPage(pageId)) return
    patchPage(pageId, { status:'processing', progress:4, progressLabel:'读取照片' })
    try {
      const scanned = await scanDocumentImage(source, {
        uniApi:uni,
        canvasId:'scanProcessCanvas',
        component:instance?.proxy,
        maxDimension:900,
        quality:0.9,
        detectSignatures:false,
        yieldToUi:true,
        rowsPerChunk:36,
        onProgress:({ value, label }) => {
          if (!cancelled && hasPage(pageId)) patchPage(pageId, { status:'processing', progress:value, progressLabel:label })
        }
      })
      if (cancelled || !hasPage(pageId)) return
      patchPage(pageId, { status:'processing', progress:94, progressLabel:'保存裁切结果' })
      const page = await persistLocalFile({ ...scanned, id:pageId, originalPath:source.path }, uni, { category:'temporary' })
      if (!hasPage(pageId)) {
        removeManagedFile(page?.path, uni)
        return
      }
      patchPage(pageId, { ...page, status:'done', progress:100, progressLabel:'裁切完成', errorText:'' })
      scanSources.delete(pageId)
    } catch (error) {
      if (!cancelled && hasPage(pageId)) {
        patchPage(pageId, {
          status:'error',
          progress:0,
          progressLabel:'裁切失败',
          errorText:String(error?.errMsg || error?.message || '无法裁切照片')
        })
      }
    }
  })
  return cropQueue
}

function handleRetry(page) {
  if (finishBusy.value || page.status !== 'error') return
  const source = scanSources.get(page.id) || { ...page, path:page.originalPath || page.path }
  scanSources.set(page.id, source)
  queueCrop(page.id, source)
}

function pageStatusText(page) {
  if (page.status === 'queued') return '等待后台裁切'
  if (page.status === 'processing') return `${page.progressLabel || '正在裁切'} ${page.progress || 0}%`
  return `${page.width || '-'} × ${page.height || '-'}`
}

async function handleContinueScan() {
  if (captureBusy.value || finishBusy.value) return
  cameraError.value = ''
  stage.value = 'camera'
  await nextTick()
  setupCameraContext()
}

function handleDelete(index) {
  if (finishBusy.value) return
  const removed = scannedPages.value[index]
  scannedPages.value = scannedPages.value.filter((_, pageIndex) => pageIndex !== index)
  scanSources.delete(removed?.id)
  removeManagedFile(removed?.path, uni)
  if (!scannedPages.value.length) handleContinueScan()
}

function touchY(event) {
  return Number(event?.touches?.[0]?.clientY ?? event?.changedTouches?.[0]?.clientY ?? event?.clientY ?? 0)
}

function handleDragStart(index, event) {
  draggingIndex.value = index
  dragTarget.value = index
  dragStartY = touchY(event)
}

function handleDragMove(event) {
  if (draggingIndex.value < 0) return
  const pageStep = 104
  const offset = Math.round((touchY(event) - dragStartY) / pageStep)
  dragTarget.value = Math.max(0, Math.min(scannedPages.value.length - 1, draggingIndex.value + offset))
}

function handleDragEnd() {
  if (draggingIndex.value >= 0 && dragTarget.value >= 0) scannedPages.value = moveScanPage(scannedPages.value, draggingIndex.value, dragTarget.value)
  handleDragCancel()
}

function handleDragCancel() {
  draggingIndex.value = -1
  dragTarget.value = -1
  dragStartY = 0
}

async function handleFinish() {
  if (!scannedPages.value.length || finishBusy.value || failedCropCount.value) return
  finishBusy.value = true
  try {
    await cropQueue.catch(() => {})
    if (cancelled) return
    if (failedCropCount.value) return
    const pages = [...scannedPages.value]
    const pdfBytes = await createScanPdfFromPaths(pages.map((page) => page.path))
    const first = pages[0]
    const pdfName = `扫描文稿-${new Date().toISOString().slice(0,10)}.pdf`
    const scanPdfPath = await savePdfBytes(pdfBytes, pdfName, { download:false, category:'temporary' })
    if (!cancelled) {
      scanCompleted = true
      eventChannel?.emit('scanComplete', {
        ...first,
        id:`scan-set-${Date.now()}`,
        name:pdfName,
        source:'scan',
        kind:'image',
        totalPages:pages.length,
        pages,
        scanPdfPath,
        scanPdfName:pdfName,
        detectedSlots:first.detectedSlots || []
      })
      uni.navigateBack()
    }
  } catch (error) {
    const message = String(error?.errMsg || error?.message || '')
    if (!cancelled) uni.showModal({ title:'生成扫描文件失败', content:message || '请重试', showCancel:false })
  } finally {
    finishBusy.value = false
  }
}

function handleCameraError(error) {
  cameraError.value = error.detail?.errMsg || '无法使用相机，请检查权限'
}
</script>

<style scoped>
.scan-page{position:relative;height:100vh;min-height:100vh;overflow:hidden;background:#0d0e12}.camera{position:absolute;inset:0;width:100%;height:100%}.h5-camera{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font-size:13px}.scan-overlay{position:absolute;z-index:10;inset:0 0 112px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.15);pointer-events:none}.guide-frame{position:relative;width:84vw;height:64vh;border:1px solid rgba(255,255,255,.58)}.corner{position:absolute;width:32px;height:32px;border-color:#fff;border-style:solid}.tl{left:-2px;top:-2px;border-width:3px 0 0 3px}.tr{right:-2px;top:-2px;border-width:3px 3px 0 0}.bl{left:-2px;bottom:-2px;border-width:0 0 3px 3px}.br{right:-2px;bottom:-2px;border-width:0 3px 3px 0}.scan-status{margin-top:17px;padding:8px 13px;color:#fff;font-size:11px;border-radius:999px;background:rgba(0,0,0,.68)}.camera-actions{position:absolute;left:0;right:0;bottom:0;z-index:30;height:112px;background:rgba(10,11,15,.92)}.capture{position:absolute;left:50%;top:14px;display:flex;width:74px;height:74px;align-items:center;justify-content:center;padding:0;border:3px solid #fff;border-radius:50%;background:transparent;transform:translateX(-50%)}.capture.disabled,.capture[disabled]{opacity:.45}.capture-inner{width:56px;height:56px;border-radius:50%;background:#fff}.capture-pressed{transform:translateX(-50%) scale(.94)}.preview-stage{display:flex;height:100%;flex-direction:column;background:var(--color-bg)}.preview-summary{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;padding:16px 18px 12px}.preview-summary>view{display:flex;flex-direction:column}.preview-summary>view text:first-child{color:var(--color-ink);font-size:18px;font-weight:900}.preview-summary>view text:last-child{margin-top:4px;color:var(--color-tertiary);font-size:10px}.preview-summary>text{display:flex;height:30px;align-items:center;padding:0 10px;color:var(--color-brand);font-size:11px;font-weight:900;border-radius:999px;background:var(--color-brand-soft)}.sort-tip{display:flex;flex-shrink:0;align-items:center;gap:7px;margin:0 18px 10px;padding:9px 11px;color:var(--color-muted);font-size:10px;border-radius:7px;background:var(--color-elevated)}.preview-list{min-height:0;flex:1;width:auto;margin:0 18px}.page-card{position:relative;display:grid;height:94px;grid-template-columns:68px minmax(0,1fr) 36px 36px;align-items:center;gap:8px;margin-bottom:10px;padding:8px;color:var(--color-ink);border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-card-soft);transition:opacity .15s,border-color .15s,transform .15s}.page-card.dragging{z-index:2;opacity:.55;transform:scale(.98)}.page-card.target{border-color:var(--color-brand);box-shadow:0 0 0 3px rgba(88,86,224,.1)}.page-thumb{position:relative;width:68px;height:78px;overflow:hidden;border-radius:5px;background:var(--color-elevated)}.page-thumb>image{width:100%;height:100%}.crop-progress{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;background:rgba(29,31,42,.58)}.crop-progress.error{background:rgba(190,48,65,.72)}.page-copy{display:flex;min-width:0;flex-direction:column}.page-copy text:first-child{font-size:13px;font-weight:900}.page-copy text:nth-child(2){margin-top:6px;overflow:hidden;color:var(--color-muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.page-copy text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:8px}.crop-state.processing,.crop-state.queued{color:var(--color-brand)!important}.retry-crop{display:flex;width:74px;height:26px;align-items:center;justify-content:center;margin:5px 0 0;padding:0;color:#fff;font-size:9px;font-weight:800;border-radius:5px;background:var(--color-danger)}.delete-page,.drag-handle{display:flex;width:34px;height:42px;align-items:center;justify-content:center;padding:0;border-radius:7px}.delete-page{background:rgba(231,76,94,.1)}.drag-handle{touch-action:none;background:var(--color-elevated)}.list-spacer{height:8px}.preview-actions{display:grid;flex-shrink:0;grid-template-columns:1fr 1.35fr;gap:10px;padding:10px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--color-quaternary);background:var(--color-surface)}.preview-actions button{display:flex;height:48px;align-items:center;justify-content:center;gap:7px;padding:0;font-size:13px;font-weight:900;border-radius:8px}.continue-button{color:var(--color-brand);border:1px solid rgba(88,86,224,.28);background:var(--color-brand-soft)}.finish-button{color:#fff;background:#238458}.process-canvas{position:fixed;left:-2200px;top:-2200px;width:900px;height:900px}
.preview-actions{display:flex;min-height:72px;gap:12px;padding:12px 18px calc(16px + env(safe-area-inset-bottom))}.preview-actions button{box-sizing:border-box;display:flex;width:100%;height:56px;min-width:0;align-items:center;justify-content:center;gap:9px;margin:0!important;padding:0 12px;font-size:14px;line-height:1;font-weight:900;letter-spacing:0;border-radius:8px}.preview-actions button text{display:block;line-height:20px;text-align:center;white-space:nowrap}.preview-actions button[disabled]{opacity:.52}.continue-button{flex:1;color:var(--color-brand);border:1px solid rgba(88,86,224,.32);background:var(--color-surface);box-shadow:0 4px 12px rgba(32,34,48,.06)}.finish-button{flex:1.15;color:#fff;border:1px solid #1f7c55;background:#238458;box-shadow:0 6px 16px rgba(35,132,88,.24)}
/* #ifdef H5 */
.scan-page{height:calc(100vh - 44px);min-height:0}
/* #endif */
</style>
