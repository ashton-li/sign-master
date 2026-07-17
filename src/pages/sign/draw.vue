<template>
  <view :class="['draw-page', themeClass, { 'library-mode': mode !== 'sign' }]">
    <view v-if="mode === 'sign'" class="draw-topbar">
      <button :class="['saved-trigger', { open: savedPanelOpen }]" @click="handleToggleSavedSignatures"><SvgIcon name="sign" :size="18" :color="savedPanelOpen ? '#ffffff' : '#5b4ee6'" /><text>{{ savedPanelOpen ? '收起我的签字' : '我的签字' }}</text></button>
    </view>
    <view class="canvas-card">
      <canvas
        canvas-id="signatureCanvas"
        id="signatureCanvas"
        :class="['signature-canvas',{ 'panel-hidden': paletteOpen || widthOpen || savedPanelOpen }]"
        disable-scroll
        @touchstart="handleTouchStart"
        @touchmove="handleTouchMove"
        @touchend="handleTouchEnd"
        @touchcancel="handleTouchEnd"
        @mousedown="handleMouseStart"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseEnd"
        @mouseleave="handleMouseEnd"
      />
      <view class="guide-line" />
      <text class="guide-text">请在此处签名</text>
      <text v-if="strokes.length === 0" class="placeholder">签字区域</text>
    </view>

    <view class="tool-bar">
      <button class="complete-btn" @click="handleDone"><SvgIcon name="check" :size="25" color="#ffffff" /><text>完成</text></button>
      <view class="tool-divider" />
      <button :class="['icon-tool',{ active: toolMode === 'pen' }]" @click="handleToolMode('pen')"><SvgIcon name="sign" :size="23" :color="toolMode === 'pen' ? '#ffffff' : '#5856e0'" /><text>画笔</text></button>
      <button :class="['icon-tool',{ active: toolMode === 'eraser' }]" @click="handleToolMode('eraser')"><SvgIcon name="eraser" :size="23" :color="toolMode === 'eraser' ? '#ffffff' : '#5856e0'" /><text>橡皮</text></button>
      <button class="icon-tool" @click="paletteOpen = !paletteOpen; widthOpen = false"><view class="selected-color" :style="{ background: color }" /><text>颜色</text></button>
      <button class="icon-tool" @click="widthOpen = !widthOpen; paletteOpen = false"><view class="width-symbol" :style="{ height: `${Math.max(2, strokeWidth / 2)}px` }" /><text>粗细</text></button>
      <view class="tool-divider" />
      <button class="small-tool" :disabled="!undoStack.length" @click="handleUndo"><SvgIcon name="undo" :size="20" color="#5856e0" /></button>
      <button class="small-tool" :disabled="!redoStack.length" @click="handleRedo"><SvgIcon name="redo" :size="20" color="#5856e0" /></button>
      <button class="small-tool" @click="handleClear"><SvgIcon name="trash" :size="20" color="#e74c5e" /></button>
    </view>

    <view v-if="paletteOpen" class="palette-panel">
      <text>选择颜色</text>
      <view class="palette-grid"><button v-for="item in colors" :key="item" :class="['palette-color',{ active:item === color }]" :style="{ background:item }" @click="handleColor(item)" /></view>
      <view class="custom-color-head"><text>自定义颜色</text><view :style="{ background: color }" /></view>
      <view class="color-slider"><text>色相</text><slider min="0" max="360" :value="hue" activeColor="#5856e0" block-size="16" @changing="handleCustomColor('hue', $event)" @change="handleCustomColor('hue', $event)" /></view>
      <view class="color-slider"><text>饱和</text><slider min="0" max="100" :value="saturation" activeColor="#5856e0" block-size="16" @changing="handleCustomColor('saturation', $event)" @change="handleCustomColor('saturation', $event)" /></view>
      <view class="color-slider"><text>明度</text><slider min="10" max="90" :value="lightness" activeColor="#5856e0" block-size="16" @changing="handleCustomColor('lightness', $event)" @change="handleCustomColor('lightness', $event)" /></view>
    </view>
    <view v-if="widthOpen" class="width-panel">
      <text>{{ strokeWidth }} px</text>
      <view class="width-slider-wrap"><slider class="width-slider" min="2" max="18" :value="strokeWidth" activeColor="#5856e0" backgroundColor="#d0d5e0" block-color="#5856e0" block-size="20" @changing="handleSizeChange" @change="handleSizeChange" /></view>
    </view>
    <view v-if="savedPanelOpen" class="saved-panel">
      <view class="saved-panel-head"><view><text>我的签字</text><text class="saved-panel-subtitle">点击签字可直接应用，再次点击左侧按钮可收起</text></view></view>
      <view class="saved-list">
        <button v-for="item in signaturesStore.signatures" :key="item.id" class="saved-item" @click="handleApplySavedSignature(item)">
          <view class="saved-preview"><image v-if="item.snapshot?.pngPath" :src="item.snapshot.pngPath" mode="aspectFit" /><SvgIcon v-else name="sign" :size="25" /></view>
          <text>{{ item.name }}</text><view v-if="item.isDefault" class="saved-default">默认</view>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { nextTick, ref } from 'vue'
import { onLoad, onReady } from '@dcloudio/uni-app'
import { useTheme } from '../../composables/useTheme'
import { persistLocalFile } from '../../core/file/sourcePicker'
import { eraseStrokes } from '../../core/signature/eraser'
import { createIncrementalSignatureRenderer } from '../../core/signature/incrementalRenderer'
import { createSignatureSnapshotFromStrokes, normalizePoint } from '../../core/signature/path'
import { useSignaturesStore } from '../../stores/signatures'
import { useSigningStore } from '../../stores/signing'
import SvgIcon from '../../components/SvgIcon.vue'

const signingStore = useSigningStore()
const signaturesStore = useSignaturesStore()
const { themeClass } = useTheme()
const mode = ref('sign')

const colors = ['#111111', '#374151', '#1e3a5f', '#2563eb', '#0ea5e9', '#0f766e', '#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#be123c', '#db2777', '#9333ea', '#6d28d9', '#7c3aed', '#795548', '#607d8b']
const color = ref(colors[0])
const hue = ref(240)
const saturation = ref(75)
const lightness = ref(45)
const strokeWidth = ref(4)
const toolMode = ref('pen')
const paletteOpen = ref(false)
const widthOpen = ref(false)
const savedPanelOpen = ref(false)
const strokes = ref([])
const undoStack = ref([])
const redoStack = ref([])
const currentStroke = ref([])
let ctx = null
let renderer = null
let canvasRect = { left: 0, top: 0, width: 900, height: 500 }
let mouseDrawing = false
let beforeAction = []
let pendingPoints = []
let flushTimer = null
let eventChannel = null

function cloneStrokes(value) {
  return JSON.parse(JSON.stringify(value))
}

onLoad((query) => {
  mode.value = ['library', 'verify'].includes(query?.mode) ? query.mode : 'sign'
  const pageTitle = mode.value === 'library' ? '新建签名' : mode.value === 'verify' ? '现场复签' : signingStore.activeSlot?.label || '手写签名'
  uni.setNavigationBarTitle({ title: pageTitle })
  const pages = getCurrentPages()
  eventChannel = pages[pages.length - 1]?.getOpenerEventChannel?.()
})

onReady(() => {
  uni.createSelectorQuery().select('#signatureCanvas').boundingClientRect((rect) => {
    if (rect) canvasRect = rect
    ctx = uni.createCanvasContext('signatureCanvas')
    renderer = createIncrementalSignatureRenderer(ctx, { width: canvasRect.width, height: canvasRect.height })
  }).exec()
})

function getTouchPoint(event) {
  const touch = event.touches?.[0] || event.changedTouches?.[0] || event
  return normalizePoint({
    x: touch?.x ?? ((touch?.clientX ?? 0) - canvasRect.left),
    y: touch?.y ?? ((touch?.clientY ?? 0) - canvasRect.top),
    pressure: touch?.force || 0.5,
    t: Date.now()
  })
}

function handleMouseStart(event) { mouseDrawing = true; handleTouchStart(event) }
function handleMouseMove(event) { if (mouseDrawing) handleTouchMove(event) }
function handleMouseEnd() { if (!mouseDrawing) return; mouseDrawing = false; handleTouchEnd() }

function handleTouchStart(event) {
  if (!renderer) return
  redoStack.value = []
  beforeAction = cloneStrokes(strokes.value)
  currentStroke.value = renderer.startStroke(getTouchPoint(event), {
    color: toolMode.value === 'eraser' ? '#ffffff' : color.value,
    width: toolMode.value === 'eraser' ? eraserRadius() * 2 : strokeWidth.value
  })
}

function handleTouchMove(event) {
  if (!renderer || !currentStroke.value?.points) return
  const point = getTouchPoint(event)
  const last = currentStroke.value.points[currentStroke.value.points.length - 1]
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.2) return
  pendingPoints.push(point)
  if (!flushTimer) flushTimer = setTimeout(flushPendingPoints, 16)
}

function handleTouchEnd() {
  if (!renderer) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = null
  flushPendingPoints()
  const stroke = renderer.endStroke()
  if (toolMode.value === 'pen' && stroke?.points?.length) strokes.value.push(stroke)
  if (toolMode.value === 'eraser' && stroke?.points?.length) {
    strokes.value = eraseStrokes(strokes.value, stroke.points, eraserRadius())
    renderer.redraw(strokes.value)
  }
  if (JSON.stringify(beforeAction) !== JSON.stringify(strokes.value)) {
    undoStack.value.push(beforeAction)
    if (undoStack.value.length > 60) undoStack.value.shift()
  }
  currentStroke.value = []
}

function flushPendingPoints() {
  flushTimer = null
  if (!pendingPoints.length || !renderer) return
  currentStroke.value = renderer.addPoints(pendingPoints.splice(0))
}

function eraserRadius() { return Math.max(24, strokeWidth.value * 3) }

function handleToolMode(modeName) {
  toolMode.value = modeName
  paletteOpen.value = false
  widthOpen.value = false
}

function handleColor(nextColor) {
  color.value = nextColor
  paletteOpen.value = false
  toolMode.value = 'pen'
}

function handleCustomColor(channel, event) {
  const value = Number(event.detail.value)
  if (channel === 'hue') hue.value = value
  if (channel === 'saturation') saturation.value = value
  if (channel === 'lightness') lightness.value = value
  color.value = hslToHex(hue.value, saturation.value, lightness.value)
  toolMode.value = 'pen'
}

function hslToHex(h, s, l) {
  const saturationValue = s / 100
  const lightnessValue = l / 100
  const chroma = (1 - Math.abs(2 * lightnessValue - 1)) * saturationValue
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1))
  const offset = lightnessValue - chroma / 2
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${[r, g, b].map((part) => Math.round((part + offset) * 255).toString(16).padStart(2, '0')).join('')}`
}

function handleSizeChange(event) {
  strokeWidth.value = Number(event.detail.value)
}

function handleUndo() {
  if (!undoStack.value.length) return
  redoStack.value.push(cloneStrokes(strokes.value))
  strokes.value = undoStack.value.pop()
  renderer?.redraw(strokes.value)
}

function handleRedo() {
  if (!redoStack.value.length) return
  undoStack.value.push(cloneStrokes(strokes.value))
  strokes.value = redoStack.value.pop()
  renderer?.redraw(strokes.value)
}

function handleClear() {
  if (!strokes.value.length) return
  undoStack.value.push(cloneStrokes(strokes.value))
  strokes.value = []
  redoStack.value = []
  renderer?.redraw([])
}

function handleCancel() {
  uni.navigateBack()
}

function handleToggleSavedSignatures() {
  paletteOpen.value = false
  widthOpen.value = false
  if (savedPanelOpen.value) {
    savedPanelOpen.value = false
    return
  }
  if (!signaturesStore.signatures.length) {
    uni.showModal({ title: '暂无我的签字', content: '请先在“我的签名”中添加签字。', showCancel: false })
    return
  }
  savedPanelOpen.value = true
}

function handleApplySavedSignature(item) {
  if (!item?.snapshot) return
  savedPanelOpen.value = false
  signingStore.useSavedSignature(item.snapshot)
  uni.redirectTo({ url: '/pages/sign/edit' })
}

async function exportTransparentPng() {
  await new Promise((resolve) => ctx.draw(true, resolve))
  const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
    canvasId: 'signatureCanvas',
    ...signatureCrop(),
    fileType: 'png',
    success: resolve,
    fail: reject
  }))
  const saved = await persistLocalFile({ id: `signature-${Date.now()}`, name: `签名-${Date.now()}.png`, path: result.tempFilePath, kind: 'image', extension: 'png' }, uni, { category: 'signatures' })
  return saved.path
}

function signatureCrop() {
  const points = strokes.value.flatMap((stroke) => stroke.points)
  const pad = 18
  const minX = Math.max(0, Math.min(...points.map((point) => point.x)) - pad)
  const minY = Math.max(0, Math.min(...points.map((point) => point.y)) - pad)
  const maxX = Math.min(canvasRect.width, Math.max(...points.map((point) => point.x)) + pad)
  const maxY = Math.min(canvasRect.height, Math.max(...points.map((point) => point.y)) + pad)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  return { x: minX, y: minY, width, height, destWidth: Math.round(width * 2), destHeight: Math.round(height * 2) }
}

async function handleDone() {
  if (!strokes.value.some((stroke) => stroke.points.length > 1)) {
    uni.showModal({ title: '还没有签名', content: '请在画布中完成签名后再保存。', showCancel: false })
    return
  }
  const baseOptions = { color: color.value, strokeWidth: strokeWidth.value, width: canvasRect.width, height: canvasRect.height }
  if (mode.value === 'verify') {
    eventChannel?.emit('verificationComplete', createSignatureSnapshotFromStrokes(strokes.value, baseOptions))
    uni.navigateBack()
    return
  }
  if (mode.value === 'library' && !await signaturesStore.requestCapacity(1)) return
  let pngPath = ''
  try {
    pngPath = await exportTransparentPng()
  } catch {
    uni.showModal({ title: '保存失败', content: '无法生成透明签名图片，请重试。', showCancel: false })
    return
  }
  const options = { ...baseOptions, pngPath }
  if (mode.value === 'library') {
    const snapshot = createSignatureSnapshotFromStrokes(strokes.value, options)
    signaturesStore.addSignature({ snapshot, color: color.value })
    uni.navigateBack()
    return
  }
  signingStore.saveSignature(strokes.value, options)
  nextTick(() => {
    uni.redirectTo({
      url: '/pages/sign/edit'
    })
  })
}
</script>

<style scoped>
.draw-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 6px 64px calc(18px + env(safe-area-inset-bottom)) calc(6px + env(safe-area-inset-left));
  color: var(--color-ink);
  background: #fafbfd;
  overflow: hidden;
}

.target-label {
  position:absolute;
  left:14px;
  top:12px;
  z-index:5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding:7px 11px;
  color:var(--color-muted);
  font-size: 12px;
  font-weight: 900;
  border-radius:999px;
  background:rgba(255,255,255,.9);
}

.dot-indicator {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #a9a7ff;
}

.canvas-card {
  position: relative;
  flex: 1;
  min-height: 230px;
  margin-top: 0;
  overflow: hidden;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7), 0 4px 14px rgba(0, 0, 0, 0.04);
}

.signature-canvas {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 100%;
  height: 100%;
}

.guide-line {
  position: absolute;
  left: 8%;
  right: 8%;
  bottom: 29%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(160, 165, 185, 0.45), transparent);
}

.guide-text {
  position: absolute;
  right: 9%;
  bottom: calc(29% + 11px);
  color: #bfc4d2;
  font-size: 10px;
  font-weight: 600;
}

.placeholder {
  position: absolute;
  left: 0;
  right: 0;
  top: 43%;
  color: #d3d8e4;
  font-family: "KaiTi", "STKaiti", "PingFang SC", cursive, serif;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 8px;
  text-align: center;
}

.tool-bar {
  position:absolute;
  right:0;
  top:0;
  bottom:calc(18px + env(safe-area-inset-bottom));
  z-index:20;
  display: flex;
  width:60px;
  padding:5px 4px;
  flex-direction:column;
  align-items: center;
  justify-content:space-between;
  border-radius:14px 0 0 14px;
  background:rgba(255,255,255,.96);
  box-shadow:0 8px 26px rgba(20,22,34,.12);
}
.complete-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:52px;height:54px;color:#fff;font-size:9px;font-weight:900;border-radius:13px;background:var(--color-brand);box-shadow:0 6px 16px rgba(88,86,224,.3)}.icon-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:50px;height:44px;color:var(--color-tertiary);font-size:8px;font-weight:800;border-radius:10px}.icon-tool.active{color:#fff;background:var(--color-brand)}.small-tool{display:flex;align-items:center;justify-content:center;width:42px;height:34px;border-radius:9px;background:#f3f4f8}.small-tool[disabled]{opacity:.32}.tool-divider{width:36px;height:1px;background:#eceef4}.selected-color{width:22px;height:22px;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #c8ccd8}.width-symbol{width:27px;min-height:2px;border-radius:999px;background:#1a1c26}.palette-panel,.width-panel{position:absolute;right:calc(82px + env(safe-area-inset-right));z-index:30;padding:12px;border-radius:14px;background:#fff;box-shadow:0 10px 30px rgba(20,22,34,.2)}.palette-panel{top:50%;width:190px;transform:translateY(-50%)}.palette-panel>text,.width-panel>text{display:block;margin-bottom:9px;color:var(--color-ink);font-size:11px;font-weight:900;text-align:center}.palette-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.palette-color{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.08)}.palette-color.active{box-shadow:0 0 0 3px #fff,0 0 0 5px var(--color-brand)}.width-panel{top:50%;width:58px;height:190px;transform:translateY(-50%)}.vertical-slider-wrap{position:relative;width:34px;height:145px;margin:auto}.vertical-slider{position:absolute;left:-55px;top:57px;width:145px;transform:rotate(-90deg)}
.complete-btn{width:50px;height:46px}.icon-tool{width:48px;height:34px}.small-tool{width:38px;height:26px}.palette-panel,.width-panel{right:68px;padding:14px;border-radius:12px}.palette-panel{width:300px}.palette-color{width:22px;height:22px}.custom-color-head{margin-top:12px;font-size:10px}.custom-color-head view{width:25px;height:25px}.color-slider{height:35px;grid-template-columns:38px 1fr;font-size:9px}.width-panel{top:50%;width:260px;height:auto;transform:translateY(-50%)}.width-slider-wrap{width:100%;height:34px}.width-slider{position:static;width:100%;margin:0;transform:none}.signature-canvas.panel-hidden{visibility:hidden}.saved-panel{position:absolute;right:84px;top:50%;z-index:40;width:300px;max-height:82%;padding:14px;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(20,22,34,.2);transform:translateY(-50%)}.saved-panel-head{display:flex;height:30px;align-items:center;justify-content:space-between;color:var(--color-ink);font-size:13px;font-weight:900}.saved-panel-head button{display:flex;width:30px;height:30px;align-items:center;justify-content:center;color:var(--color-tertiary);font-size:22px}.saved-list{display:flex;max-height:220px;flex-direction:column;gap:7px;overflow-y:auto}.saved-item{position:relative;display:grid;min-height:62px;grid-template-columns:108px 1fr;align-items:center;gap:9px;padding:6px 9px;color:var(--color-ink);font-size:11px;font-weight:900;text-align:left;border:1px solid #e5e7ef;border-radius:8px;background:#fafbfe}.saved-preview{display:flex;height:48px;align-items:center;justify-content:center;color:var(--color-brand);overflow:hidden;background:#fff}.saved-preview image{width:100%;height:100%}.saved-default{position:absolute;right:7px;top:5px;padding:2px 5px;color:#fff;font-size:7px;border-radius:999px;background:var(--color-brand)}
.draw-page{padding:6px 82px calc(18px + env(safe-area-inset-bottom)) calc(8px + env(safe-area-inset-left))}.draw-topbar{display:flex;height:46px;flex-shrink:0;align-items:center;gap:10px;padding:0 2px}.canvas-back{display:flex;height:36px;align-items:center;justify-content:center;gap:3px;padding:0 12px;color:#313647;font-size:11px;font-weight:900;border:1px solid #dfe3ec;border-radius:8px;background:#fff}.draw-context{display:flex;min-width:0;flex:1;align-items:center;gap:6px;color:var(--color-muted);font-size:12px;font-weight:900}.saved-trigger{position:static;display:flex;height:38px;align-items:center;justify-content:center;gap:5px;padding:0 13px;color:#5b4ee6;font-size:11px;font-weight:900;border:1px solid rgba(91,78,230,.3);border-radius:9px;background:#f2f0ff;box-shadow:0 3px 10px rgba(91,78,230,.12)}.canvas-card{margin-top:3px;border-radius:10px}.tool-bar{width:76px;padding:7px 5px}.complete-btn{width:64px;height:62px;font-size:10px;border-radius:14px}.icon-tool{width:64px;height:44px;font-size:9px;border-radius:10px}.small-tool{width:56px;height:40px;border-radius:10px}.tool-divider{width:48px}.palette-panel,.width-panel{right:90px}.saved-panel{right:88px}.guide-line{bottom:25%}.guide-text{bottom:calc(25% + 11px)}
.draw-page{position:relative;padding:6px 88px calc(18px + env(safe-area-inset-bottom)) calc(72px + env(safe-area-inset-left))}.draw-topbar{height:48px}.draw-context{height:42px;padding:0 10px;color:#4b5060;font-size:13px;border-radius:9px;background:#f7f8fb}.saved-trigger{position:absolute;left:calc(7px + env(safe-area-inset-left));top:60px;z-index:34;display:flex;width:54px;height:148px;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:8px 5px;color:#5b4ee6;font-size:11px;line-height:16px;text-align:center;border:1px solid rgba(91,78,230,.3);border-radius:11px;background:#f2f0ff;box-shadow:0 5px 15px rgba(91,78,230,.16)}.saved-trigger text{white-space:normal;text-align:center}.saved-trigger.open{color:#fff;border-color:#5b4ee6;background:#5b4ee6}.canvas-card{margin-top:2px}.saved-panel{left:calc(70px + env(safe-area-inset-left));right:96px;top:56px;width:auto;max-height:calc(100% - 72px);padding:16px;transform:none}.saved-panel-head{height:38px;font-size:14px}.saved-list{display:grid;max-height:calc(100vh - 170px);grid-template-columns:1fr 1fr;gap:10px;overflow-y:auto}.saved-item{min-height:82px;grid-template-columns:minmax(110px,150px) 1fr;padding:8px 10px;font-size:12px}.saved-preview{height:64px}.saved-close{display:flex;align-items:center;justify-content:center}.complete-btn,.icon-tool,.small-tool{text-align:center}
.draw-page{padding-top:6px}.draw-page.library-mode{padding-left:calc(8px + env(safe-area-inset-left))}.draw-topbar{height:0}.canvas-card{margin-top:0}.saved-trigger{top:18px}.saved-panel{left:20%;right:auto;top:18px;width:60%;max-height:calc(100% - 36px);box-sizing:border-box}.saved-panel-head{justify-content:flex-start}.saved-list{max-height:calc(100vh - 132px)}
</style>
