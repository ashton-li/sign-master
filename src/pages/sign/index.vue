<template>
  <PageShell :tab="false" :compact="stage !== 'source'">
    <template v-if="stage === 'source'">
      <view class="source-heading">
        <text class="ref-page-title">选择文件来源</text>
        <text class="ref-subtitle">支持 PDF、PNG、JPG、JPEG、WEBP、BMP</text>
      </view>
      <view class="source-grid">
        <button v-for="source in sources" :key="source.key" class="source-card soft-card" :disabled="busy" @click="handleSource(source)">
          <view :class="['source-icon', source.tone]"><SvgIcon :name="source.icon" :size="27" /></view>
          <text class="source-title">{{ source.title }}</text>
          <text class="source-desc">{{ source.desc }}</text>
        </button>
      </view>
      <view class="recent-section">
        <text class="section-title">最近使用</text>
        <view v-if="filesStore.files.length" class="recent-list soft-card">
          <button v-for="file in filesStore.files.slice(0, 5)" :key="file.id" class="recent-row" @click="handleRecent(file)">
            <SvgIcon :name="file.kind === 'image' ? 'image' : 'file'" :size="20" />
            <view class="recent-copy"><text>{{ file.name }}</text><text>{{ file.date }}</text></view>
            <text class="chevron">›</text>
          </button>
        </view>
        <view v-else class="empty-recent soft-card"><text>暂无最近文件，先从上方导入</text></view>
      </view>
      <view v-if="busy" class="picker-mask"><view class="picker-spinner" /><text>正在读取文件…</text></view>
    </template>

    <template v-else-if="stage === 'analyzing'">
      <view class="analysis-page">
        <view class="analysis-visual">
          <view class="analysis-ring ring-one" />
          <view class="analysis-ring ring-two" />
          <view class="analysis-icon"><SvgIcon name="scan" :size="38" color="#ffffff" /></view>
        </view>
        <text class="analysis-title">正在识别签字位</text>
        <text class="analysis-file">{{ pendingFile?.name }}</text>
        <view class="analysis-progress"><view :style="{ width: `${analysisPercent}%` }" /></view>
        <text class="analysis-time">最多等待 3 秒</text>
        <!-- #ifndef MP-WEIXIN -->
        <button class="skip-analysis" @click="handleSkipAnalysis"><SvgIcon name="sign" :size="21" color="#ffffff" /><text>跳过识别，直接签字</text></button>
        <!-- #endif -->
      </view>
    </template>

    <template v-else>
      <view class="recognize-layout">
        <view class="recognize-header">
          <text class="recognize-title">{{ signingStore.document?.name }}</text>
          <view class="recognize-meta"><text class="detection-badge">{{ detectionLabel }}</text><text class="recognize-page">第{{ signingStore.document?.page || 1 }}/{{ signingStore.document?.totalPages || 1 }}页</text></view>
        </view>
        <view :class="['doc-card', { multipage: signingStore.document?.totalPages > 1 }]">
          <view id="documentPreview" class="doc-preview" @touchstart="handlePreviewTouchStart" @touchmove.stop.prevent="handlePreviewTouchMove" @touchend="handleDocumentTap" @touchcancel="handlePreviewTouchEnd">
            <view class="document-stage">
              <view class="document-content" :style="previewContentStyle">
                <image v-if="displayPreview" class="document-image" :src="displayPreview" mode="scaleToFill" @load="previewLoaded = true" @error="handlePreviewError" />
                <button v-else-if="signingStore.document?.kind === 'pdf'" class="pdf-preview" @click.stop="handleOpenOriginal"><SvgIcon name="file" :size="34" /><text>预览原 PDF</text></button>
                <view v-else class="preview-unavailable"><SvgIcon name="image" :size="28" /><text>文件预览加载失败</text><button @click.stop="handleChangeFile">重新选择文件</button></view>
                <view v-for="slot in currentSlots" :key="slot.id" class="slot-highlight" :style="slotStyle(slot)" hover-class="slot-highlight-pressed" @touchstart.stop @touchend.stop="handleSlotActivate(slot)" @tap.stop="handleSlotActivate(slot)"><text>{{ slot.label }}</text></view>
              </view>
            </view>
            <view v-if="signingStore.document?.scanPdfPath" class="pdf-ready">扫描 PDF 已生成</view>
            <view v-if="displayPreview && !previewLoaded" class="preview-loading"><view class="picker-spinner" /><text>正在显示文件</text></view>
</view>
          <view v-if="signingStore.document?.totalPages > 1" class="page-controls"><button :disabled="signingStore.document.page <= 1" @click="handlePageChange(-1)">上一页</button><text>{{ signingStore.document.page }}/{{ signingStore.document.totalPages }}</text><button :disabled="signingStore.document.page >= signingStore.document.totalPages" @click="handlePageChange(1)">下一页</button></view>
        </view>
        <view class="recognize-tip"><text>{{ placementMode ? '请点击文档中的签字位置' : '点击识别框开始签字，也可手动添加位置' }}</text></view>
        <view class="recognize-actions">
          <button class="change-file" @click="handleChangeFile"><view class="recognize-action-icon"><SvgIcon name="file" :size="21" color="#5856e0" /></view><text>更换文件</text></button>
          <button :class="['manual-slot',{ active: placementMode }]" @click="handlePlacementToggle"><view class="recognize-action-icon"><SvgIcon :name="placementMode ? 'minus' : 'plus'" :size="21" :color="placementMode ? '#ffffff' : '#5856e0'" /></view><text>{{ placementMode ? '取消放置' : '添加签字位' }}</text></button>
        </view>
      </view>
    </template>

    <canvas v-if="stage === 'analyzing'" id="scanCanvas" canvas-id="scanCanvas" class="scan-canvas" :style="{ width: `${scanSize.width}px`, height: `${scanSize.height}px` }" :width="scanSize.width" :height="scanSize.height" />
    <!-- #ifdef MP-WEIXIN -->
    <cover-view v-if="stage === 'analyzing'" class="skip-analysis-cover" hover-stop-propagation @touchstart.stop="handleSkipAnalysis">跳过识别，直接签字</cover-view>
    <!-- #endif -->
  </PageShell>
</template>

<script setup>
import { onLoad, onResize, onShow, onUnload } from '@dcloudio/uni-app'
import { computed, getCurrentInstance, nextTick, reactive, ref } from 'vue'
import PageShell from '../../components/PageShell.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { analyzePdfDocument } from '../../core/file/pdfAnalyzer'
import { discardTemporaryDocument, persistDocumentFiles, pickDocumentSource } from '../../core/file/sourcePicker'
import { calculateContainRect } from '../../core/gestures/transform'
import { analyzeDocumentImage } from '../../core/vision/documentScanner'
import { useFilesStore } from '../../stores/files'
import { useSignaturesStore } from '../../stores/signatures'
import { useSigningStore } from '../../stores/signing'

const signingStore = useSigningStore()
const filesStore = useFilesStore()
const signaturesStore = useSignaturesStore()
const instance = getCurrentInstance()
const stage = ref('source')
const busy = ref(false)
const scanSize = reactive({ width: 640, height: 640 })
const placementMode = ref(false)
const previewScale = ref(1)
const previewAttempt = ref(0)
const previewLoaded = ref(false)
const displayPreview = ref('')
const previewBounds = reactive({ width: 0, height: 0 })
const pendingFile = ref(null)
const analysisPercent = ref(0)
let analysisToken = 0
let analysisTimer = null
let pickerReturnTimer = null
let pickerSession = null
let skipRequested = false
let previewPinchDistance = 0
let previewTouchMoved = false
let previewLongPressTimer = null
let previewLongPressTriggered = false
let previewTouchStartPoint = null
let lastSlotActivation = { id: '', at: 0 }
const ANALYSIS_TIMEOUT_MS = 2800

const sources = [
  { key: 'camera', title: '拍摄文件', desc: '调用相机拍摄原图', icon: 'camera', tone: 'camera' },
  { key: 'album', title: '相册图片', desc: '选择常用图片格式', icon: 'image', tone: 'album' },
  { key: 'wechat', title: '微信文件', desc: 'PDF 与常用图片', icon: 'chat', tone: 'wechat' },
  { key: 'scan', title: '扫描文稿', desc: '连续扫描、自动裁边与校正', icon: 'scan', tone: 'scan' }
]

const detectedSlotCount = computed(() => currentSlots.value.filter((slot) => slot.source !== 'manual').length)
const detectionLabel = computed(() => detectedSlotCount.value ? `识别到 ${detectedSlotCount.value} 个签字位` : '未识别到签字位')
const currentPageInfo = computed(() => signingStore.document?.pages?.[Math.max(0, (signingStore.document.page || 1) - 1)] || signingStore.document || {})
const previewCandidates = computed(() => [...new Set((signingStore.document?.kind === 'image' ? [
  currentPageInfo.value?.previewPath,
  currentPageInfo.value?.correctedPreviewPath,
  currentPageInfo.value?.path,
  signingStore.document?.previewPath,
  signingStore.document?.correctedPreviewPath,
  signingStore.document?.path,
  currentPageInfo.value?.originalPath,
  signingStore.document?.originalPath
] : [currentPageInfo.value?.previewPath, signingStore.document?.previewPath]).filter(Boolean))])
const currentSlots = computed(() => signingStore.slots.filter((slot) => !slot.page || slot.page === (signingStore.document?.page || 1)))
const documentContentStyle = computed(() => {
  if (!previewBounds.width || !previewBounds.height) return { left: '0', top: '0', width: '100%', height: '100%' }
  const geometry = getContentGeometry(previewBounds.width, previewBounds.height)
  return { left: `${geometry.left}px`, top: `${geometry.top}px`, width: `${geometry.width}px`, height: `${geometry.height}px` }
})
const previewContentStyle = computed(() => ({
  ...documentContentStyle.value,
  transform: `translate(${-(previewScale.value - 1) * 50}%, ${-(previewScale.value - 1) * 50}%) scale(${previewScale.value})`
}))

onLoad((query) => {
  if (query?.fresh === '1') signingStore.resetFlow()
  stage.value = query?.stage === 'recognize' && signingStore.hasProject ? 'recognize' : 'source'
  if (stage.value === 'recognize') nextTick(() => { updatePreviewBounds(); resolvePreviewSource() })
})
onResize(() => nextTick(updatePreviewBounds))
onShow(() => {
  if (stage.value !== 'source' || !pickerSession || pickerSession.selected) return
  if (pickerReturnTimer) clearTimeout(pickerReturnTimer)
  pickerReturnTimer = setTimeout(() => {
    if (!pickerSession?.selected) {
      pickerSession.cancelled = true
      pickerSession = null
      busy.value = false
    }
  }, 400)
})
onUnload(() => {
  cancelAnalysis()
  clearPreviewLongPress()
  if (pickerReturnTimer) clearTimeout(pickerReturnTimer)
  discardTemporaryDocument(pendingFile.value, uni)
  const activePath = String(signingStore.document?.path || '')
  if (activePath.includes('/sign-master/temporary/')) {
    discardTemporaryDocument(signingStore.document, uni)
    signingStore.resetFlow()
  }
})

function slotStyle(slot) {
  return { left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${slot.width * 100}%`, height: `${slot.height * 100}%` }
}

function getContentGeometry(containerWidth, containerHeight) {
  const sourceWidth = Number(currentPageInfo.value?.width || signingStore.document?.width || 1)
  const sourceHeight = Number(currentPageInfo.value?.height || signingStore.document?.height || 1)
  return calculateContainRect(containerWidth, containerHeight, sourceWidth, sourceHeight)
}

function updatePreviewBounds() {
  uni.createSelectorQuery().select('#documentPreview').boundingClientRect((rect) => {
    if (!rect) return
    previewBounds.width = rect.width
    previewBounds.height = rect.height
  }).exec()
}

function cancelAnalysis() {
  analysisToken += 1
  if (analysisTimer) clearInterval(analysisTimer)
  analysisTimer = null
}

function startProgress() {
  analysisPercent.value = 8
  const startedAt = Date.now()
  analysisTimer = setInterval(() => {
    analysisPercent.value = Math.min(94, 8 + (Date.now() - startedAt) / ANALYSIS_TIMEOUT_MS * 86)
  }, 80)
}

async function analyzeFile(file) {
  const options = { uniApi: uni, canvasId: 'scanCanvas', component: instance?.proxy, maxDimension: 640 }
  if (file.kind === 'pdf') return analyzePdfDocument(file, options)
  if (file.pages?.length > 1) {
    const pages = []
    const detectedSlots = []
    for (let index = 0; index < file.pages.length; index += 1) {
      const page = await analyzeDocumentImage(file.pages[index], options)
      pages.push(page)
      detectedSlots.push(...(page.detectedSlots || []).map((slot) => ({ ...slot, id: `${slot.id}-p${index + 1}`, page: index + 1 })))
    }
    return { ...file, pages, detectedSlots, totalPages: pages.length }
  }
  const analyzed = await analyzeDocumentImage(file, options)
  if (file.pages?.length === 1) {
    analyzed.pages = [{ ...file.pages[0], width: analyzed.width, height: analyzed.height, previewPath: analyzed.previewPath || file.pages[0].path, correctedPreviewPath: analyzed.correctedPreviewPath || '' }]
  }
  return analyzed
}

async function beginAnalysis(file) {
  pendingFile.value = file
  // #ifdef MP-WEIXIN
  await startDefaultSignature(file)
  return
  // #endif

  cancelAnalysis()
  skipRequested = false
  const token = analysisToken
  stage.value = 'analyzing'
  await nextTick()
  if (token !== analysisToken) return
  startProgress()
  const startedAt = Date.now()
  try {
    const result = await Promise.race([
      analyzeFile(file).then((analyzed) => ({ analyzed })),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), ANALYSIS_TIMEOUT_MS))
    ])
    if (token !== analysisToken) return
    const remainingDelay = Math.max(0, 450 - (Date.now() - startedAt))
    if (remainingDelay) await new Promise((resolve) => setTimeout(resolve, remainingDelay))
    if (token !== analysisToken) return
    if (result.timeout) startDefaultSignature(file)
    else finishAnalysis(result.analyzed)
  } catch (error) {
    if (token !== analysisToken) return
    console.error('[signMaster] document analysis failed', error)
    startDefaultSignature(file)
  }
}

async function finishAnalysis(file) {
  cancelAnalysis()
  analysisPercent.value = 100
  if (!file.detectedSlots?.length) {
    await startDefaultSignature(file)
    return
  }
  pendingFile.value = null
  signingStore.setPickedFile(file)
  stage.value = 'recognize'
  previewScale.value = 1
  previewAttempt.value = 0
  previewLoaded.value = false
  nextTick(() => { updatePreviewBounds(); resolvePreviewSource() })
}

async function startDefaultSignature(file = pendingFile.value) {
  cancelAnalysis()
  if (!file) return
  pendingFile.value = null
  signingStore.setPickedFile({ ...file, detectedSlots: [] })
  stage.value = 'recognize'
  previewScale.value = 1
  previewLoaded.value = false
  nextTick(resolvePreviewSource)
  uni.navigateTo({ url: '/pages/sign/draw' })
}

function handleSkipAnalysis() {
  if (skipRequested || stage.value !== 'analyzing') return
  skipRequested = true
  startDefaultSignature()
}

async function handleSource(source) {
  if (source.key === 'scan') {
    uni.navigateTo({ url: '/pages/sign/scan', events: { scanComplete: (file) => beginAnalysis(file) } })
    return
  }
  const session = { selected: false, cancelled: false }
  pickerSession = session
  busy.value = false
  try {
    const selected = await pickDocumentSource(source.key, { uniApi: uni, persist: false })
    session.selected = true
    if (pickerReturnTimer) clearTimeout(pickerReturnTimer)
    if (session.cancelled || pickerSession !== session || !selected?.path) {
      busy.value = false
      return
    }
    busy.value = true
    const file = await persistDocumentFiles(selected, uni, { category:'temporary' })
    if (!file?.path) {
      busy.value = false
      return
    }
    pickerSession = null
    busy.value = false
    await nextTick()
    beginAnalysis(file)
  } catch (error) {
    session.selected = true
    if (pickerReturnTimer) clearTimeout(pickerReturnTimer)
    if (session.cancelled) return
    pickerSession = null
    const message = String(error?.errMsg || error?.message || '')
    if (!/cancel/i.test(message)) uni.showModal({ title: '导入失败', content: message || '无法读取所选文件', showCancel: false })
    busy.value = false
  }
}

function handleRecent(file) {
  const project = filesStore.getProject(file)
  if (project && signingStore.loadProject(project)) {
    uni.navigateTo({ url: '/pages/sign/edit' })
    return
  }
  if (!file.path) {
    uni.showModal({ title: '文件已失效', content: '本地文件已被清理，请重新导入。', showCancel: false })
    return
  }
  beginAnalysis(file)
}

function applyStoredSignature(slot, saved) {
  if (!saved?.snapshot) return
  signingStore.selectSlot(slot.id)
  signingStore.useSavedSignature(saved.snapshot)
  uni.navigateTo({ url: '/pages/sign/edit' })
}

function chooseStoredSignature(slot, savedSignatures) {
  if (savedSignatures.length === 1) {
    applyStoredSignature(slot, savedSignatures[0])
    return
  }
  uni.showActionSheet({
    itemList: savedSignatures.map((item) => item.name || item.label || '未命名签名'),
    success: ({ tapIndex }) => applyStoredSignature(slot, savedSignatures[tapIndex])
  })
}

function handleSlotClick(slot) {
  signingStore.selectSlot(slot.id)
  const savedSignatures = [...signaturesStore.signatures].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)))
  if (!savedSignatures.length) {
    uni.navigateTo({ url: '/pages/sign/draw' })
    return
  }
  uni.showActionSheet({
    itemList: ['应用已有签名', '手写签名'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) chooseStoredSignature(slot, savedSignatures)
      else uni.navigateTo({ url: '/pages/sign/draw' })
    }
  })
}

function handleSlotActivate(slot) {
  const now = Date.now()
  if (lastSlotActivation.id === slot.id && now - lastSlotActivation.at < 600) return
  lastSlotActivation = { id: slot.id, at: now }
  handleSlotClick(slot)
}

function setPreviewScale(value) {
  previewScale.value = Math.max(1, Math.min(3, Number(value.toFixed(2))))
}

function handlePlacementToggle() {
  const nextMode = !placementMode.value
  if (nextMode) setPreviewScale(1)
  placementMode.value = nextMode
}

function handlePageChange(delta) {
  signingStore.setDocumentPage(signingStore.document.page + delta)
  setPreviewScale(1)
  previewAttempt.value = 0
  previewLoaded.value = false
  nextTick(() => { updatePreviewBounds(); resolvePreviewSource() })
}

function resolvePreviewSource() {
  previewLoaded.value = false
  displayPreview.value = ''
  const candidates = previewCandidates.value
  if (!candidates.length) return
  const tryCandidate = (index) => {
    const path = candidates[index]
    if (!path) return
    uni.getImageInfo({
      src: path,
      success: () => { previewAttempt.value = index; displayPreview.value = path },
      fail: () => {
        if (index + 1 < candidates.length) tryCandidate(index + 1)
        else { previewAttempt.value = index; displayPreview.value = path }
      }
    })
  }
  tryCandidate(0)
}

function handlePreviewError() {
  if (previewAttempt.value < previewCandidates.value.length - 1) {
    previewAttempt.value += 1
    previewLoaded.value = false
    displayPreview.value = previewCandidates.value[previewAttempt.value]
  }
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0
  return Math.hypot((touches[1].clientX || touches[1].x || 0) - (touches[0].clientX || touches[0].x || 0), (touches[1].clientY || touches[1].y || 0) - (touches[0].clientY || touches[0].y || 0))
}

function touchPoint(event) {
  const touch = event?.changedTouches?.[0] || event?.touches?.[0] || event
  if (!touch) return null
  return { x: touch.clientX ?? touch.x, y: touch.clientY ?? touch.y }
}

function clearPreviewLongPress() {
  if (previewLongPressTimer) clearTimeout(previewLongPressTimer)
  previewLongPressTimer = null
}

function handlePreviewTouchStart(event) {
  clearPreviewLongPress()
  previewTouchMoved = false
  previewLongPressTriggered = false
  previewPinchDistance = touchDistance(event.touches)
  previewTouchStartPoint = touchPoint(event)
  if (previewPinchDistance || !previewTouchStartPoint) return
  const point = { ...previewTouchStartPoint }
  previewLongPressTimer = setTimeout(() => {
    previewLongPressTimer = null
    if (previewTouchMoved) return
    previewLongPressTriggered = true
    placementMode.value = false
    handleDocumentLongPress(point)
  }, 550)
}

function handlePreviewTouchMove(event) {
  const distance = touchDistance(event.touches)
  if (!distance) {
    const point = touchPoint(event)
    if (point && previewTouchStartPoint && Math.hypot(point.x - previewTouchStartPoint.x, point.y - previewTouchStartPoint.y) > 10) {
      previewTouchMoved = true
      clearPreviewLongPress()
    }
    return
  }
  clearPreviewLongPress()
  previewTouchMoved = true
  if (!previewPinchDistance || placementMode.value) return
  const next = previewScale.value * distance / previewPinchDistance
  if (Math.abs(next - previewScale.value) > 0.01) {
    setPreviewScale(next)
  }
  previewPinchDistance = distance
}

function handlePreviewTouchEnd() {
  clearPreviewLongPress()
  previewPinchDistance = 0
  previewTouchStartPoint = null
}

function createSlotAtDocumentPoint(point, callback) {
  const query = uni.createSelectorQuery()
  query.select('#documentPreview').boundingClientRect()
  query.select('.document-content').boundingClientRect()
  query.exec(([previewRect, transformedRect]) => {
    if (!previewRect) return
    const geometry = getContentGeometry(previewRect.width, previewRect.height)
    const fallback = {
      left: previewRect.left + geometry.left,
      top: previewRect.top + geometry.top,
      width: geometry.width,
      height: geometry.height
    }
    const contentRect = transformedRect?.width && transformedRect?.height ? transformedRect : fallback
    const normalizedX = (point.x - contentRect.left) / Math.max(1, contentRect.width)
    const normalizedY = (point.y - contentRect.top) / Math.max(1, contentRect.height)
    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      uni.showToast({ title: '请长按文档内容区域', icon: 'none' })
      return
    }
    const slot = signingStore.addManualSlot({
      label: `签字位${signingStore.slots.length + 1}`,
      x: Math.max(0, Math.min(0.68, normalizedX - 0.16)),
      y: Math.max(0, Math.min(0.92, normalizedY - 0.04))
    })
    callback(slot)
  }).exec()
}

function handleDocumentLongPress(point) {
  uni.showActionSheet({
    itemList: ['应用已有签名', '手写签名'],
    success: ({ tapIndex }) => {
      if (tapIndex === 1) {
        createSlotAtDocumentPoint(point, () => uni.navigateTo({ url: '/pages/sign/draw' }))
        return
      }
      const signatures = signaturesStore.signatures
      if (!signatures.length) {
        uni.showModal({ title: '暂无已有签名', content: '请先手写一个签名，保存后即可快速应用。', showCancel: false })
        return
      }
      uni.showActionSheet({
        itemList: signatures.map((item) => item.name || item.label || '未命名签名'),
        success: ({ tapIndex: signatureIndex }) => {
          const saved = signatures[signatureIndex]
          if (!saved) return
          createSlotAtDocumentPoint(point, (slot) => {
            signingStore.selectSlot(slot.id)
            signingStore.useSavedSignature(saved.snapshot)
            uni.navigateTo({ url: '/pages/sign/edit' })
          })
        }
      })
    }
  })
}

function handleDocumentTap(event) {
  handlePreviewTouchEnd()
  if (previewLongPressTriggered) { previewLongPressTriggered = false; return }
  if (previewTouchMoved) { previewTouchMoved = false; return }
  if (!placementMode.value) return
  const point = touchPoint(event)
  if (!point) return
  createSlotAtDocumentPoint(point, (slot) => {
    placementMode.value = false
    handleSlotClick(slot)
  })
}

function handleChangeFile() {
  placementMode.value = false
  setPreviewScale(1)
  stage.value = 'source'
}

function handleOpenOriginal() {
  uni.openDocument({ filePath: signingStore.document.path, showMenu: true, fail: (error) => uni.showModal({ title: '预览失败', content: error.errMsg || '无法打开该 PDF', showCancel: false }) })
}
</script>

<style scoped>
.source-heading{margin:4px 0 14px}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.source-card{display:flex;width:100%;height:126px;flex-direction:column;align-items:center;justify-content:center;text-align:center}.source-icon{display:flex;width:48px;height:48px;align-items:center;justify-content:center;margin-bottom:10px;border-radius:10px;color:#5856e0;background:#efefff}.source-icon.album,.source-icon.scan{color:#318c54;background:#e9f8ee}.source-icon.wechat{color:#3cae55;background:#e9f8eb}.source-title{color:var(--color-ink);font-size:15px;font-weight:900}.source-desc{max-width:135px;margin-top:6px;color:var(--color-tertiary);font-size:11px;line-height:16px}.recent-section{margin-top:16px}.section-title{display:block;margin-bottom:8px;color:var(--color-ink);font-size:14px;font-weight:900}.recent-list{max-height:174px;overflow:hidden}.recent-row{display:flex;width:100%;min-height:54px;align-items:center;gap:11px;padding:8px 14px;color:var(--color-brand);text-align:left;border-bottom:1px solid rgba(0,0,0,.05)}.recent-row:last-child{border-bottom:0}.recent-copy{display:flex;min-width:0;flex:1;flex-direction:column;color:var(--color-ink);font-size:12px;font-weight:800}.recent-copy text:last-child{margin-top:3px;color:var(--color-tertiary);font-size:10px;font-weight:500}.empty-recent{display:flex;height:58px;align-items:center;justify-content:center;color:var(--color-tertiary);font-size:11px}.picker-mask{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#fff;background:rgba(20,22,32,.62);font-size:12px;font-weight:800}.picker-spinner{width:32px;height:32px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
.analysis-page{display:flex;height:calc(100vh - 72px);flex-direction:column;align-items:center;justify-content:center;padding-bottom:env(safe-area-inset-bottom);text-align:center}.analysis-visual{position:relative;display:flex;width:142px;height:142px;align-items:center;justify-content:center}.analysis-ring{position:absolute;border:1px solid rgba(88,86,224,.22);border-radius:50%;animation:analysisPulse 1.8s ease-out infinite}.ring-one{inset:8px}.ring-two{inset:22px;animation-delay:.35s}.analysis-icon{position:relative;z-index:2;display:flex;width:68px;height:68px;align-items:center;justify-content:center;border-radius:18px;background:var(--color-brand);box-shadow:0 12px 28px rgba(88,86,224,.3)}.analysis-title{margin-top:14px;color:var(--color-ink);font-size:20px;font-weight:900}.analysis-file{max-width:80%;margin-top:7px;overflow:hidden;color:var(--color-tertiary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.analysis-progress{width:220px;height:6px;margin-top:24px;overflow:hidden;border-radius:999px;background:#e1e3ec}.analysis-progress view{height:100%;border-radius:999px;background:var(--color-brand);transition:width .08s linear}.analysis-time{margin-top:8px;color:var(--color-tertiary);font-size:10px}.skip-analysis{display:flex;width:220px;height:48px;align-items:center;justify-content:center;gap:8px;margin-top:24px;color:#fff;font-size:13px;font-weight:900;border-radius:8px;background:var(--color-brand);box-shadow:0 7px 18px rgba(88,86,224,.24)}
.recognize-layout{display:flex;height:calc(100vh - 48px - env(safe-area-inset-bottom));min-height:0;flex-direction:column;overflow:hidden}.recognize-header{display:flex;height:34px;flex-shrink:0;align-items:center;justify-content:space-between;gap:8px;padding:0 2px}.recognize-title{min-width:0;flex:1;overflow:hidden;color:var(--color-ink);font-size:13px;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.recognize-meta{display:flex;flex-shrink:0;align-items:center;gap:7px}.detection-badge{padding:4px 7px;color:var(--color-brand);font-size:9px;font-weight:900;border-radius:6px;background:var(--color-brand-soft)}.recognize-page{color:var(--color-tertiary);font-size:9px}.doc-card{display:flex;min-height:0;flex:1;padding:6px;border-radius:8px;background:#eef0f5;border:1px solid rgba(0,0,0,.05)}.doc-card.multipage{display:grid;grid-template-rows:minmax(0,1fr) 30px}.doc-preview{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;border:1px solid #e2e5ed;border-radius:4px;background:#fff}.document-stage{position:relative;width:100%;height:100%}.document-content{position:absolute;overflow:hidden;background:#fff}.document-image{width:100%;height:100%}.pdf-preview{display:flex;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--color-brand);font-size:12px}.pdf-ready{position:absolute;left:8px;top:8px;z-index:2;padding:4px 7px;color:#167743;font-size:8px;font-weight:800;border-radius:6px;background:rgba(220,250,232,.94)}.preview-loading{position:absolute;left:50%;top:50%;z-index:7;display:flex;flex-direction:column;align-items:center;gap:7px;padding:10px 14px;color:var(--color-tertiary);font-size:9px;border-radius:8px;background:rgba(255,255,255,.92);transform:translate(-50%,-50%)}.preview-loading .picker-spinner{width:23px;height:23px;border-color:rgba(88,86,224,.18);border-top-color:var(--color-brand)}.slot-highlight{position:absolute;z-index:3;display:flex;box-sizing:border-box;align-items:center;justify-content:flex-start;padding:0 5px;overflow:hidden;color:#5856e0;font-size:9px;font-weight:900;text-align:left;border:2px dashed #6e67ff;border-radius:6px;background:rgba(88,86,224,.08)}.slot-highlight text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.slot-highlight-pressed{border-color:#3730c8;background:rgba(88,86,224,.2)}.page-controls{display:flex;align-items:center;justify-content:space-between;color:var(--color-tertiary);font-size:9px}.page-controls button{padding:5px 10px;color:var(--color-brand);font-size:10px}.page-controls button[disabled]{opacity:.35}.recognize-tip{display:flex;height:24px;flex-shrink:0;align-items:center;justify-content:center;color:var(--color-tertiary);font-size:9px;text-align:center}.recognize-actions{display:grid;grid-template-columns:1fr 1fr;flex-shrink:0;gap:9px}.change-file,.manual-slot{display:flex;height:50px;align-items:center;justify-content:center;gap:8px;color:var(--color-brand);font-size:11px;font-weight:900;border:1px solid rgba(88,86,224,.22);border-radius:8px;background:#fff}.recognize-action-icon{display:flex;width:30px;height:30px;align-items:center;justify-content:center;border-radius:7px;background:var(--color-brand-soft)}.manual-slot{background:#f6f6ff}.manual-slot.active{color:#fff;border-color:var(--color-brand);background:var(--color-brand)}.manual-slot.active .recognize-action-icon{background:rgba(255,255,255,.14)}.zoom-controls{position:absolute;right:8px;bottom:8px;z-index:9;display:grid;height:42px;grid-template-columns:40px 54px 40px;gap:3px;padding:3px;border:1px solid rgba(0,0,0,.05);border-radius:8px;background:rgba(255,255,255,.96);box-shadow:0 5px 16px rgba(0,0,0,.12)}.zoom-controls button{display:flex;align-items:center;justify-content:center;color:var(--color-brand);font-size:18px;font-weight:800;border-radius:5px;background:#f1f2fb}.zoom-controls .fit-button{font-size:10px}.scan-canvas{position:fixed;left:-2200px;top:-2200px}.chevron{color:#b8bdc9;font-size:18px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes analysisPulse{0%{opacity:.9;transform:scale(.85)}100%{opacity:0;transform:scale(1.08)}}
.skip-analysis-cover{position:fixed;left:50%;bottom:calc(28px + env(safe-area-inset-bottom));z-index:999;display:block;width:238px;height:50px;line-height:50px;text-align:center;color:#39290b;font-size:13px;font-weight:900;border:1px solid #e3b84c;border-radius:10px;background:#ffd86b;box-shadow:0 8px 20px rgba(145,101,16,.24);transform:translateX(-50%)}.doc-preview{touch-action:none}.document-stage{overflow:hidden}.document-content{transform-origin:center center;transition:transform .12s ease-out}.document-image{display:block}.preview-unavailable{display:flex;width:100%;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--color-tertiary);font-size:11px}.preview-unavailable button{min-height:34px;padding:0 12px;color:#fff;font-size:10px;border-radius:7px;background:var(--color-brand)}
.analysis-page,.recognize-layout{height:100%}
.recognize-actions{gap:12px}.change-file,.manual-slot{height:56px;padding:0 12px;line-height:normal;text-align:center;border-radius:10px}.change-file{color:#3e4658;border-color:#d8dce6;background:#fff}.change-file .recognize-action-icon{color:#3e4658;background:#eef0f5}.manual-slot{color:#176b43;border-color:#a9d8bf;background:#edfaf3}.manual-slot .recognize-action-icon{color:#176b43;background:#d9f3e5}.manual-slot.active{color:#fff;border-color:#27875a;background:#27875a}.recognize-actions text{line-height:18px;text-align:center}
</style>
