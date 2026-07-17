<template>
  <PageShell :tab="false" compact>
    <view class="edit-root">
      <view class="file-strip">
        <SvgIcon name="file" :size="18" />
        <text class="file-label">{{ signingStore.document?.name }}</text>
        <text class="count-badge">{{ signingStore.layers.length }}个签字</text>
        <button class="continue-sign" @click="handleContinueSigning"><SvgIcon name="plus" :size="15" /><text>继续签字</text></button>
      </view>

      <view id="editorSurface" class="editor" @touchstart="handleEditorTouchStart" @touchmove="handleEditorTouchMove" @touchend="handleEditorTouchEnd" @touchcancel="handleEditorTouchEnd">
        <view id="documentSurface" class="document-surface" :style="documentSurfaceStyle">
          <view class="paper">
            <image v-if="currentPagePreview" class="source-document" :src="currentPagePreview" mode="scaleToFill" @load="scheduleEditorLayout" />
            <view v-else class="pdf-document"><SvgIcon name="file" :size="42" /><text>{{ signingStore.document?.name }}</text><button @click.stop="handleOpenOriginal">打开原 PDF</button></view>
            <view v-for="slot in currentSlots" :key="slot.id" class="slot-ghost" :style="slotGhostStyle(slot)" />
          </view>

          <view v-if="guideX" class="alignment-guide vertical" />
          <view v-if="guideY" class="alignment-guide horizontal" />

          <view
            v-for="layer in currentLayers"
            :key="layer.id"
            :class="['sig-layer', { selected: layer.id === signingStore.selectedLayerId, locked: layer.locked }]"
            :style="layerStyle(layer)"
            @touchstart.stop="handleLayerTouchStart($event, layer)"
            @touchmove.stop.prevent="handleLayerTouchMove"
            @touchend.stop="handleLayerTouchEnd"
            @touchcancel.stop="handleLayerTouchEnd"
            @click.stop="signingStore.selectLayer(layer.id)"
          >
            <image v-if="layer.snapshot?.pngPath" class="signature-layer-image" :src="layer.snapshot.pngPath" mode="aspectFit" />
            <SignatureInk v-else :canvas-id="`edit-${layer.id}`" :snapshot="layer.snapshot" :width="Math.round(layer.width)" :height="Math.round(layer.height)" fluid />
            <view v-if="layer.id === signingStore.selectedLayerId && !layer.locked" class="sig-handles">
              <view class="handle tl" /><view class="handle tr" /><view class="handle bl" />
              <view class="handle br" @touchstart.stop="handleResizeStart($event, layer)" @touchmove.stop.prevent="handleResizeMove" @touchend.stop="handleLayerTouchEnd" />
            </view>
          </view>
        </view>
        <view v-if="signaturePickerOpen" class="signature-picker-mask" @touchstart.stop @touchmove.stop @touchend.stop @click.stop="signaturePickerOpen = false">
          <view class="signature-picker" @click.stop>
            <view class="signature-picker-head"><view><text>我的签字</text><text>选择后放到文档默认位置</text></view><button @click="signaturePickerOpen = false">关闭</button></view>
            <scroll-view class="signature-picker-list" scroll-y>
              <button v-for="signature in signaturesStore.signatures" :key="signature.id" class="signature-choice" @touchend.stop="handleUseSignature(signature)" @tap.stop="handleUseSignature(signature)">
                <image :src="signature.snapshot?.pngPath || signaturePreviewSource(signature.snapshot)" mode="aspectFit" />
                <text>{{ signature.name || signature.label || '我的签字' }}</text>
              </button>
            </scroll-view>
          </view>
        </view>
      </view>

      <view v-if="signingStore.document?.totalPages > 1" class="editor-pages">
        <button :disabled="signingStore.document.page <= 1" @click="handlePageChange(-1)">上一页</button><text>{{ signingStore.document.page }}/{{ signingStore.document.totalPages }}</text><button :disabled="signingStore.document.page >= signingStore.document.totalPages" @click="handlePageChange(1)">下一页</button>
      </view>

      <view class="editor-dock">
        <view class="tool-row">
          <button class="icon-tool" :disabled="!signingStore.undoStack.length" @click="signingStore.undoLayers()"><SvgIcon name="undo" :size="23" /><text>撤销</text></button>
          <button class="icon-tool" :disabled="!signingStore.redoStack.length" @click="signingStore.redoLayers()"><SvgIcon name="redo" :size="23" /><text>重做</text></button>
          <button class="icon-tool" @click="handleLock"><SvgIcon :name="signingStore.selectedLayer?.locked ? 'unlock' : 'lock'" :size="23" /><text>{{ signingStore.selectedLayer?.locked ? '解锁' : '锁定' }}</text></button>
          <button class="icon-tool" @click="handleRotate"><SvgIcon name="rotate" :size="23" /><text>旋转</text></button>
          <button class="icon-tool" @click="handleReset"><SvgIcon name="reset" :size="23" /><text>重置</text></button>
          <button class="icon-tool danger" @click="handleDelete"><SvgIcon name="trash" :size="23" color="#e5484d" /><text>删除</text></button>
        </view>
        <view class="dock-actions">
          <view v-if="signingStore.selectedLayer" class="opacity-control"><text>透明度</text><slider min="20" max="100" :value="Math.round((signingStore.selectedLayer.opacity || 1) * 100)" activeColor="#5856e0" block-size="16" @changing="handleOpacityChanging" @change="handleOpacityCommit" /><text>{{ Math.round((signingStore.selectedLayer.opacity || 1) * 100) }}%</text></view>
          <view v-else class="selection-hint">点击签字可移动、缩放或旋转</view>
          <button class="signature-library" @click="handleOpenSignaturePicker"><SvgIcon name="signatureLibrary" :size="19" /><text>我的签字</text></button>
          <button class="finish-button" @click="handleFinish"><SvgIcon name="check" :size="20" color="#ffffff" /><text>完成调整</text></button>
        </view>
      </view>
    </view>
  </PageShell>
</template>

<script setup>
import { onLoad, onResize, onShow, onUnload } from '@dcloudio/uni-app'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { calculateContainRect, calculatePinchTransform, getTouchMetrics, snapLayerToGuides } from '../../core/gestures/transform'
import { buildSvgPath } from '../../core/signature/path'
import { useFilesStore } from '../../stores/files'
import { useSigningStore } from '../../stores/signing'
import { useSignaturesStore } from '../../stores/signatures'

const signingStore = useSigningStore()
const filesStore = useFilesStore()
const signaturesStore = useSignaturesStore()
const guideX = ref(false)
const guideY = ref(false)
const signaturePickerOpen = ref(false)
const editorFrame = reactive({ width: 330, height: 500 })
let editorRect = { left: 0, top: 0, width: 330, height: 500 }
let opacityBefore = null
let pendingPatch = null
let patchTimer = null
let editorLongPressTimer = null
let layoutTimers = []
let lastSignatureChoice = { id:'', at:0 }
const editorPress = reactive({ startX: 0, startY: 0, x: 0, y: 0, triggered: false })
const currentLayers = computed(() => signingStore.layers.filter((layer) => !layer.page || layer.page === (signingStore.document?.page || 1)))
const currentSlots = computed(() => signingStore.slots.filter((slot) => !slot.page || slot.page === (signingStore.document?.page || 1)))
const currentPageInfo = computed(() => signingStore.document?.pages?.[Math.max(0, (signingStore.document.page || 1) - 1)] || signingStore.document || {})
const currentPagePreview = computed(() => currentPageInfo.value?.previewPath || (signingStore.document?.kind === 'image' ? currentPageInfo.value?.path || signingStore.document?.path : ''))
const documentSurfaceStyle = computed(() => {
  const sourceWidth = Number(currentPageInfo.value?.width || signingStore.document?.width || 1)
  const sourceHeight = Number(currentPageInfo.value?.height || signingStore.document?.height || 1)
  const rect = calculateContainRect(editorFrame.width, editorFrame.height, sourceWidth, sourceHeight)
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
})

const drag = reactive({ active:false, layerId:'', startX:0, startY:0, originX:0, originY:0, beforeLayers:null, mode:'drag', startDistance:0, startAngle:0, originWidth:0, originHeight:0, originRotation:0 })

onLoad((query) => {
  if (!query?.fileId) return
  const file = filesStore.getFile(decodeURIComponent(query.fileId))
  const project = filesStore.getProject(file)
  if (project) signingStore.loadProject(project)
  else uni.showModal({ title:'文件工程已失效', content:'该文件的可编辑工程不存在，请重新签署。', showCancel:false, success:() => uni.navigateBack() })
})
onMounted(scheduleEditorLayout)
onShow(scheduleEditorLayout)
onResize(scheduleEditorLayout)
onUnload(() => { clearEditorLongPress(); clearLayoutTimers(); flushLayerPatch(); signingStore.saveDraft() })

function clearLayoutTimers() {
  layoutTimers.forEach((timer) => clearTimeout(timer))
  layoutTimers = []
}

function scheduleEditorLayout() {
  clearLayoutTimers()
  nextTick(updateEditorRects)
  layoutTimers = [60, 180, 360].map((delay) => setTimeout(updateEditorRects, delay))
}

function updateEditorRects() {
  uni.createSelectorQuery().select('#editorSurface').boundingClientRect((rect) => {
    if (!rect) return
    editorFrame.width = rect.width
    editorFrame.height = rect.height
    nextTick(() => uni.createSelectorQuery().select('#documentSurface').boundingClientRect((surface) => { if (surface) editorRect = surface }).exec())
  }).exec()
}

function layerStyle(layer) {
  return { left:`${layer.x / 330 * 100}%`, top:`${layer.y / 500 * 100}%`, width:`${layer.width / 330 * 100}%`, height:`${layer.height / 500 * 100}%`, opacity:layer.opacity, transform:`rotate(${layer.rotation || 0}deg)` }
}
function slotGhostStyle(slot) { return { left:`${slot.x * 100}%`, top:`${slot.y * 100}%`, width:`${slot.width * 100}%`, height:`${slot.height * 100}%` } }
function getTouch(event) { return event.touches?.[0] || event.changedTouches?.[0] || {} }

function scheduleLayerPatch(patch) {
  pendingPatch = { ...(pendingPatch || {}), ...patch }
  if (patchTimer) return
  patchTimer = setTimeout(() => { patchTimer = null; flushLayerPatch() }, 16)
}
function flushLayerPatch() {
  if (patchTimer) { clearTimeout(patchTimer); patchTimer = null }
  if (!pendingPatch) return
  const patch = pendingPatch; pendingPatch = null
  signingStore.updateSelectedLayer(patch, { transient: true })
}

function handleLayerTouchStart(event, layer) {
  signingStore.selectLayer(layer.id)
  if (layer.locked) return
  const touch = getTouch(event)
  Object.assign(drag, { active:true, layerId:layer.id, startX:touch.clientX || touch.x || 0, startY:touch.clientY || touch.y || 0, originX:layer.x, originY:layer.y, beforeLayers:JSON.parse(JSON.stringify(signingStore.layers)), originWidth:layer.width, originHeight:layer.height, originRotation:layer.rotation || 0 })
  if (event.touches?.length >= 2) {
    drag.mode = 'transform'
    const metrics = getTouchMetrics(event.touches)
    drag.startDistance = metrics.distance; drag.startAngle = metrics.angle
  } else drag.mode = 'drag'
}

function handleLayerTouchMove(event) {
  if (!drag.active) return
  if (drag.mode === 'transform' && event.touches?.length >= 2) {
    const transformed = calculatePinchTransform({ width:drag.originWidth, height:drag.originHeight, rotation:drag.originRotation }, { distance:drag.startDistance, angle:drag.startAngle }, getTouchMetrics(event.touches))
    const ratio = Math.min(transformed.width / drag.originWidth, (330 - drag.originX) / drag.originWidth, (500 - drag.originY) / drag.originHeight)
    scheduleLayerPatch({ width:Math.max(54, drag.originWidth * ratio), height:Math.max(24, drag.originHeight * ratio), rotation:transformed.rotation })
    return
  }
  const touch = getTouch(event)
  const dx = ((touch.clientX || touch.x || 0) - drag.startX) * 330 / Math.max(1, editorRect.width)
  const dy = ((touch.clientY || touch.y || 0) - drag.startY) * 500 / Math.max(1, editorRect.height)
  const snapped = snapLayerToGuides({ x:drag.originX + dx, y:drag.originY + dy }, signingStore.selectedLayer || { width:0, height:0 }, { width:330, height:500 })
  guideX.value = snapped.guideX; guideY.value = snapped.guideY
  scheduleLayerPatch({ x:snapped.x, y:snapped.y })
}

function handleResizeStart(event, layer) { handleLayerTouchStart(event, layer); drag.mode = 'resize' }
function handleResizeMove(event) {
  if (!drag.active) return
  const touch = getTouch(event)
  const dx = ((touch.clientX || touch.x || 0) - drag.startX) * 330 / Math.max(1, editorRect.width)
  const requested = Math.max(.35, Math.min(3.5, (drag.originWidth + dx) / drag.originWidth))
  const ratio = Math.min(requested, (330 - drag.originX) / drag.originWidth, (500 - drag.originY) / drag.originHeight)
  scheduleLayerPatch({ width:Math.max(54, drag.originWidth * ratio), height:Math.max(24, drag.originHeight * ratio) })
}
function handleLayerTouchEnd() { flushLayerPatch(); if (drag.active) signingStore.commitTransientChange(drag.beforeLayers); drag.active=false; drag.beforeLayers=null; guideX.value=false; guideY.value=false }
function clearEditorLongPress() { if (editorLongPressTimer) clearTimeout(editorLongPressTimer); editorLongPressTimer = null }
function handleEditorTouchStart(event) {
  if (!drag.active) signingStore.selectLayer('')
  const touch = getTouch(event)
  const clientX = touch.clientX ?? touch.x ?? 0
  const clientY = touch.clientY ?? touch.y ?? 0
  Object.assign(editorPress, { startX: clientX, startY: clientY, x: clientX, y: clientY, triggered: false })
  clearEditorLongPress()
  editorLongPressTimer = setTimeout(() => {
    editorLongPressTimer = null
    editorPress.triggered = true
    handleDocumentLongPress(editorPress.x, editorPress.y)
  }, 550)
}
function handleEditorTouchMove(event) {
  const touch = getTouch(event)
  editorPress.x = touch.clientX ?? touch.x ?? editorPress.x
  editorPress.y = touch.clientY ?? touch.y ?? editorPress.y
  if (Math.hypot(editorPress.x - editorPress.startX, editorPress.y - editorPress.startY) > 10) clearEditorLongPress()
}
function handleEditorTouchEnd() { clearEditorLongPress() }
function createSlotAtPoint(clientX, clientY) {
  const x = (clientX - editorRect.left) / Math.max(1, editorRect.width)
  const y = (clientY - editorRect.top) / Math.max(1, editorRect.height)
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return signingStore.addManualSlot({
    label: `签字位${signingStore.slots.length + 1}`,
    page: signingStore.document?.page || 1,
    x: Math.max(0, Math.min(0.68, x - 0.16)),
    y: Math.max(0, Math.min(0.92, y - 0.04)),
    width: 0.32,
    height: 0.08
  })
}
function handleDocumentLongPress(clientX, clientY) {
  const x = (clientX - editorRect.left) / Math.max(1, editorRect.width)
  const y = (clientY - editorRect.top) / Math.max(1, editorRect.height)
  if (x < 0 || x > 1 || y < 0 || y > 1) return
  uni.showActionSheet({
    itemList: ['手写签名', '应用已有签名'],
    success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        const slot = createSlotAtPoint(clientX, clientY)
        if (!slot) return
        signingStore.selectSlot(slot.id)
        uni.navigateTo({ url: '/pages/sign/draw' })
        return
      }
      if (!signaturesStore.signatures.length) {
        uni.showModal({ title: '暂无已有签名', content: '请先在“我的签名”中创建签名，或选择手写签名。', showCancel: false })
        return
      }
      uni.showActionSheet({
        itemList: signaturesStore.signatures.map((item) => item.name || item.label || '我的签名'),
        success: ({ tapIndex: signatureIndex }) => {
          const signature = signaturesStore.signatures[signatureIndex]
          const slot = createSlotAtPoint(clientX, clientY)
          if (!signature?.snapshot || !slot) return
          signingStore.selectSlot(slot.id)
          signingStore.useSavedSignature(signature.snapshot)
        }
      })
    }
  })
}

function handleOpenSignaturePicker() {
  if (!signaturesStore.signatures.length) {
    uni.showModal({ title:'暂无已有签字', content:'请先在“我的签名”中创建签字，或使用顶部“继续签字”手写。', showCancel:false })
    return
  }
  signaturePickerOpen.value = true
}
function signaturePreviewSource(snapshot) {
  if (!snapshot) return ''
  const width = Math.max(1, Number(snapshot.width || 330))
  const height = Math.max(1, Number(snapshot.height || 180))
  const strokes = snapshot.strokes?.length ? snapshot.strokes : [{ points:snapshot.points || [], color:snapshot.color, width:snapshot.strokeWidth }]
  const paths = strokes.map((stroke) => {
    const path = buildSvgPath(stroke.points || [])
    if (!path) return ''
    const color = stroke.color || snapshot.color || '#1a1c26'
    const strokeWidth = Number(stroke.width || snapshot.strokeWidth || 4)
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
function handleUseSignature(signature) {
  if (!signature?.snapshot) return
  const now = Date.now()
  if (lastSignatureChoice.id === signature.id && now - lastSignatureChoice.at < 650) return
  lastSignatureChoice = { id:signature.id, at:now }
  const slot = signingStore.addManualSlot({
    label:`签字位${signingStore.slots.length + 1}`,
    page:signingStore.document?.page || 1,
    x:0.34,
    y:0.46,
    width:0.32,
    height:0.08
  })
  signingStore.selectSlot(slot.id)
  signingStore.useSavedSignature(signature.snapshot)
  signaturePickerOpen.value = false
  nextTick(scheduleEditorLayout)
}
function handleLock() { signingStore.toggleSelectedLock() }
function handleRotate() { signingStore.rotateSelectedLayer(-15) }
function handleReset() {
  const layer = signingStore.selectedLayer
  const slot = signingStore.slots.find((item) => item.id === layer?.slotId || item.label === layer?.label) || signingStore.activeSlot
  if (!layer || !slot) return
  signingStore.updateSelectedLayer({ x:Math.round(slot.x * 330), y:Math.round(slot.y * 500), width:Math.min(330 - slot.x * 330, Math.max(72, Math.round(slot.width * 330))), height:Math.min(500 - slot.y * 500, Math.max(24, Math.round(slot.height * 500))), rotation:0, opacity:1 })
}
function handleOpacityChanging(event) { if (!opacityBefore) opacityBefore=JSON.parse(JSON.stringify(signingStore.layers)); scheduleLayerPatch({ opacity:Number(event.detail.value) / 100 }) }
function handleOpacityCommit() { flushLayerPatch(); signingStore.commitTransientChange(opacityBefore); opacityBefore=null }
function handleDelete() { signingStore.deleteSelectedLayer() }
function handlePageChange(delta) { signingStore.setDocumentPage(signingStore.document.page + delta); scheduleEditorLayout() }
function handleContinueSigning() {
  flushLayerPatch()
  const page = signingStore.document?.page || 1
  const filledSlotIds = new Set(signingStore.layers.filter((layer) => (layer.page || page) === page).map((layer) => layer.slotId))
  const slot = currentSlots.value.find((item) => !filledSlotIds.has(item.id)) || signingStore.addManualSlot({
    label: `签字位${signingStore.slots.length + 1}`,
    page,
    x: 0.34,
    y: Math.min(0.84, 0.4 + (currentSlots.value.length % 4) * 0.12),
    width: 0.32,
    height: 0.08
  })
  signingStore.selectSlot(slot.id)
  uni.navigateTo({ url: '/pages/sign/draw' })
}
function handleFinish() {
  flushLayerPatch()
  if (!signingStore.layers.length) { uni.showModal({ title:'没有签字', content:'请返回添加至少一个签字。', showCancel:false }); return }
  signingStore.buildExport('pdf'); uni.navigateTo({ url:'/pages/sign/preview' })
}
function handleOpenOriginal() { uni.openDocument({ filePath:signingStore.document.path, showMenu:true }) }
</script>

<style scoped>
.edit-root{position:relative;min-height:100vh;margin:0 -18px;padding:0 12px 142px;background:#f5f6fa}.file-strip{display:flex;height:64px;align-items:center;gap:8px;padding:0 4px}.file-label{min-width:0;flex:1;overflow:hidden;color:var(--color-ink);font-size:14px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.count-badge{flex-shrink:0;padding:6px 8px;color:var(--color-brand);font-size:9px;font-weight:800;border-radius:7px;background:var(--color-brand-soft)}.continue-sign{display:flex;min-width:132px;height:44px;flex-shrink:0;align-items:center;justify-content:center;gap:6px;padding:0 16px;color:#fff;font-size:12px;font-weight:900;line-height:normal;text-align:center;border-radius:9px;background:#e76f3c;box-shadow:0 5px 12px rgba(231,111,60,.22)}.editor{position:relative;height:calc(100vh - 206px);min-height:320px;overflow:hidden;border:1px solid rgba(0,0,0,.06);border-radius:8px;background:#e9ebf1;box-shadow:0 8px 22px rgba(26,28,38,.08)}.document-surface{position:absolute;overflow:hidden;background:#fff;box-shadow:0 3px 12px rgba(26,28,38,.12)}.paper{position:absolute;inset:0;background:#fff}.source-document{display:block;width:100%;height:100%}.pdf-document{display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--color-brand);font-size:12px;font-weight:800}.pdf-document button{min-height:40px;padding:0 16px;color:#fff;border-radius:8px;background:var(--color-brand)}.slot-ghost{position:absolute;border:1.5px dashed #d5d8e5;border-radius:5px;opacity:.4}.sig-layer{position:absolute;z-index:8;display:flex;align-items:center;justify-content:center;overflow:visible;border:2px solid transparent;border-radius:5px}.signature-layer-image{width:100%;height:100%}.sig-layer.selected{border-color:var(--color-brand);box-shadow:0 0 0 4px rgba(88,86,224,.1)}.sig-layer.locked{opacity:.72}.sig-handles{position:absolute;inset:-8px;pointer-events:none}.handle{position:absolute;width:13px;height:13px;border:2px solid var(--color-brand);border-radius:50%;background:#fff}.tl{top:-2px;left:-2px}.tr{top:-2px;right:-2px}.bl{bottom:-2px;left:-2px}.br{right:-2px;bottom:-2px;pointer-events:auto}.alignment-guide{position:absolute;z-index:7;background:rgba(88,86,224,.65);pointer-events:none}.alignment-guide.vertical{top:0;bottom:0;left:50%;width:1px}.alignment-guide.horizontal{left:0;right:0;top:50%;height:1px}.editor-pages{position:absolute;left:50%;bottom:148px;z-index:30;display:flex;align-items:center;gap:10px;padding:5px 9px;color:var(--color-tertiary);font-size:10px;border-radius:999px;background:rgba(255,255,255,.94);transform:translateX(-50%)}.editor-pages button{min-height:28px;color:var(--color-brand);font-size:10px}.editor-pages button[disabled]{opacity:.35}.editor-dock{position:fixed;left:0;right:0;bottom:0;z-index:80;padding:7px 6px calc(7px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.86);background:rgba(255,255,255,.98);box-shadow:0 -6px 20px rgba(26,28,38,.08)}.tool-row{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;overflow:hidden;padding:0}.icon-tool{display:flex;width:100%;height:48px;min-width:0;flex:none;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0;color:var(--color-tertiary);font-size:8px;font-weight:800;border-radius:8px;background:#f4f5f9}.icon-tool :deep(.svg-icon){width:20px!important;height:20px!important}.icon-tool[disabled]{opacity:.35}.icon-tool.danger{color:#e5484d;background:#fff1f1}.dock-actions{display:grid;grid-template-columns:minmax(140px,1fr) 76px 118px;align-items:center;gap:7px;margin-top:7px}.opacity-control{display:grid;min-width:0;height:46px;grid-template-columns:38px minmax(42px,1fr) 28px;align-items:center;padding:0 7px;color:var(--color-tertiary);font-size:8px;border-radius:7px;background:#f5f6fa}.opacity-control slider{width:100%;margin:0}.selection-hint{display:flex;height:46px;align-items:center;padding:0 8px;color:var(--color-tertiary);font-size:9px;border-radius:7px;background:#f5f6fa}.save-draft,.finish-button{display:flex;width:100%;height:46px;align-items:center;justify-content:center;gap:5px;padding:0;font-size:11px;font-weight:900;line-height:normal;text-align:center;border-radius:7px}.save-draft{color:#77510a;border:1px solid #e7c36c;background:#fff8e7}.finish-button{color:#fff;background:#27875a;box-shadow:0 5px 14px rgba(39,135,90,.22)}@media(max-width:340px){.count-badge{display:none}.dock-actions{grid-template-columns:minmax(110px,1fr) 64px 102px;gap:4px}.opacity-control{grid-template-columns:30px minmax(30px,1fr) 24px;padding:0 4px}.finish-button,.save-draft{font-size:10px}.continue-sign{min-width:112px;padding:0 10px;font-size:11px}}
.dock-actions{grid-template-columns:minmax(130px,1fr) 92px 118px}.signature-library{display:flex;width:100%;height:46px;align-items:center;justify-content:center;gap:5px;padding:0;color:#5a3b92;font-size:10px;font-weight:900;line-height:normal;text-align:center;border:1px solid #cdb9e8;border-radius:7px;background:#f7f1ff}.signature-library::after{display:none}.signature-picker-mask{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(25,28,38,.32)}.signature-picker{display:flex;width:82%;max-width:420px;max-height:76%;flex-direction:column;overflow:hidden;border:1px solid rgba(30,33,45,.08);border-radius:8px;background:#fff;box-shadow:0 18px 46px rgba(28,31,43,.28)}.signature-picker-head{display:flex;min-height:58px;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #eceef3}.signature-picker-head>view{display:flex;flex-direction:column}.signature-picker-head text:first-child{color:#242735;font-size:14px;font-weight:900}.signature-picker-head text:last-child{margin-top:3px;color:#8b8f9e;font-size:9px}.signature-picker-head button{display:flex;width:58px;height:34px;align-items:center;justify-content:center;color:#545967;font-size:11px;font-weight:800;border-radius:7px;background:#f0f1f5}.signature-picker-list{max-height:330px;padding:8px;box-sizing:border-box}.signature-choice{display:grid;width:100%;min-height:82px;grid-template-columns:minmax(0,1fr) 82px;align-items:center;margin-bottom:7px;padding:6px 9px;border:1px solid #e4e6ed;border-radius:7px;background:#fafbfc}.signature-choice image,.signature-choice :deep(canvas){width:100%;height:66px}.signature-choice text{overflow:hidden;color:#303440;font-size:11px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.signature-choice::after,.signature-picker-head button::after{display:none}
@media(max-width:340px){.dock-actions{grid-template-columns:minmax(74px,1fr) 76px 96px;gap:4px}.signature-library{font-size:9px}.signature-picker{width:88%}}
.signature-choice image,.signature-choice text{pointer-events:none}.signature-choice :deep(canvas){display:none}
</style>
