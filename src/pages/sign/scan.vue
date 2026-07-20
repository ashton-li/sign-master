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
      <view class="camera h5-camera"><SvgIcon name="scan" :size="54" color="#ffffff" /><text>将纸张四边对齐边框，点击拍照</text></view>
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
          <view class="page-thumb" @click.stop="handlePreview(index)">
            <image :src="page.path" mode="aspectFill" />
            <view v-if="page.status !== 'done'" :class="['crop-progress', page.status]"><text>{{ page.status === 'error' ? '!' : `${page.progress || 0}%` }}</text></view>
          </view>
          <view class="page-copy">
            <text>第 {{ index + 1 }} 页</text><text>{{ page.name }}</text>
            <template v-if="page.status === 'error'">
              <text class="crop-error">{{ page.errorText || '裁切失败，请重试' }}</text>
              <button class="retry-crop" @click.stop="handleRetry(page)">重新裁切</button>
            </template>
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

    <canvas
      id="scanProcessCanvas"
      canvas-id="scanProcessCanvas"
      class="process-canvas"
      :width="processCanvasSize.width"
      :height="processCanvasSize.height"
      :style="{ width:`${processCanvasSize.width}px`, height:`${processCanvasSize.height}px` }"
    />
  </view>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, ref } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import SvgIcon from '../../components/SvgIcon.vue'
import { useTheme } from '../../composables/useTheme'
import { ensureWriteCapacity, fileSize } from '../../core/storage/capacity'
import { moveScanPage } from '../../core/file/scanPages'
import { discardTemporaryDocument, persistLocalFile, pickDocumentSource, removeManagedFile } from '../../core/file/sourcePicker'
import { cropImageToGuideFrame } from '../../core/vision/documentScanner'

const instance = getCurrentInstance()
const { themeClass } = useTheme()
const stage = ref('camera')
const captureBusy = ref(false)
const finishBusy = ref(false)
const cameraError = ref('')
const scannedPages = ref([])
const processCanvasSize = ref({ width:900, height:900 })
const draggingIndex = ref(-1)
const dragTarget = ref(-1)
let dragStartY = 0
let eventChannel = null
let cameraContext = null
let cancelled = false
let scanCompleted = false
let cropQueue = Promise.resolve()
const scanSources = new Map()

async function resizeProcessCanvas(width, height) {
  const nextSize = { width:Math.max(1, Math.ceil(width)), height:Math.max(1, Math.ceil(height)) }
  if (processCanvasSize.value.width === nextSize.width && processCanvasSize.value.height === nextSize.height) return
  processCanvasSize.value = nextSize
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 16))
}

function ascii(value) {
  const output = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) output[index] = value.charCodeAt(index) & 0xff
  return output
}

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('扫描页不是有效的 JPEG 图片')
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 1 >= bytes.length) break
    const size = (bytes[offset] << 8) | bytes[offset + 1]
    if (size < 2 || offset + size > bytes.length) break
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width:(bytes[offset + 5] << 8) | bytes[offset + 6], height:(bytes[offset + 3] << 8) | bytes[offset + 4] }
    }
    offset += size
  }
  throw new Error('无法读取扫描页尺寸')
}

function createScanPdf(jpegPages) {
  if (!jpegPages.length) throw new Error('扫描页为空')
  const pages = jpegPages.map((bytes) => {
    const size = jpegDimensions(bytes)
    const landscape = size.width > size.height
    const pageWidth = landscape ? 842 : 595
    const pageHeight = landscape ? 595 : 842
    const scale = Math.min(pageWidth / size.width, pageHeight / size.height)
    return { bytes, ...size, pageWidth, pageHeight, drawWidth:size.width * scale, drawHeight:size.height * scale }
  })
  const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const objects = []
  const pageIds = pages.map((_, index) => 3 + index * 3)
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'))
  objects.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`))
  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    const number = (value) => Number(value.toFixed(2)).toString()
    const x = (page.pageWidth - page.drawWidth) / 2
    const y = (page.pageHeight - page.drawHeight) / 2
    const content = `q\n${number(page.drawWidth)} 0 0 ${number(page.drawHeight)} ${number(x)} ${number(y)} cm\n/Im${index + 1} Do\nQ\n`
    objects.push(ascii(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`))
    objects.push(joinBytes([
      ascii(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`),
      page.bytes,
      ascii('\nendstream\nendobj\n')
    ]))
    objects.push(ascii(`${contentId} 0 obj\n<< /Length ${ascii(content).length} >>\nstream\n${content}endstream\nendobj\n`))
  })
  let offset = header.length
  const xref = ['0000000000 65535 f \n']
  objects.forEach((object) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
    offset += object.length
  })
  return joinBytes([header, ...objects, ascii(`xref\n0 ${xref.length}\n${xref.join('')}trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`)])
}

async function readScanJpeg(path) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath:path,
      success:({ data }) => resolve(data instanceof Uint8Array ? data : new Uint8Array(data)),
      fail:reject
    })
  })
  // #endif
  // #ifndef MP-WEIXIN
  const response = await fetch(path)
  if (!response.ok) throw new Error(`无法读取扫描页：${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
  // #endif
}

async function createScanPdfFromPathsInline(paths) {
  const pages = []
  for (const path of paths) pages.push(await readScanJpeg(path))
  return createScanPdf(pages)
}

async function saveScanPdfBytes(bytes, fileName) {
  // #ifdef MP-WEIXIN
  const fs = wx.getFileSystemManager()
  const directory = `${wx.env.USER_DATA_PATH}/sign-master/temporary`
  const filePath = `${directory}/${fileName}`
  await ensureWriteCapacity(bytes.byteLength, { uniApi:uni, replacementBytes:fileSize(filePath, fs) })
  try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
  return new Promise((resolve, reject) => fs.writeFile({
    filePath,
    data:bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    success:() => resolve(filePath),
    fail:reject
  }))
  // #endif
  // #ifndef MP-WEIXIN
  return URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }))
  // #endif
}

const pendingCropCount = computed(() => scannedPages.value.filter((page) => page.status === 'queued' || page.status === 'processing').length)
const failedCropCount = computed(() => scannedPages.value.filter((page) => page.status === 'error').length)
const previewStatusText = computed(() => {
  if (failedCropCount.value) return `${failedCropCount.value} 页裁切失败，可点击重试`
  if (pendingCropCount.value) return `${pendingCropCount.value} 页正在后台裁切，可继续拍摄`
  return '原尺寸裁切已完成'
})
const finishButtonText = computed(() => {
  if (finishBusy.value && pendingCropCount.value) return '等待裁切…'
  if (finishBusy.value) return '正在生成…'
  return '完成扫描'
})

const statusText = computed(() => {
  if (captureBusy.value) return '正在保存照片…'
  if (cameraError.value) return cameraError.value
  return '请将纸张四边对齐边框后拍照'
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

function defaultGuideFrame() {
  const windowInfo = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
  const previewWidth = Math.max(1, Number(windowInfo.windowWidth) || 375)
  const previewHeight = Math.max(1, Number(windowInfo.windowHeight) || 667)
  const frameWidth = previewWidth * 0.82
  const frameHeight = frameWidth * 297 / 210
  const overlayHeight = Math.max(1, previewHeight - 112)
  return {
    previewWidth,
    previewHeight,
    x:(previewWidth - frameWidth) / 2 / previewWidth,
    y:Math.max(0, (overlayHeight - frameHeight) / 2) / previewHeight,
    width:frameWidth / previewWidth,
    height:Math.min(1, frameHeight / previewHeight)
  }
}

function measureGuideFrame() {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(defaultGuideFrame()), 350)
    if (typeof uni.createSelectorQuery !== 'function') {
      finish(defaultGuideFrame())
      return
    }
    const query = uni.createSelectorQuery().in(instance?.proxy)
    query.select('.camera').boundingClientRect()
    query.select('.guide-frame').boundingClientRect()
    query.exec((rects = []) => {
      const camera = rects[0]
      const guide = rects[1]
      if (!camera?.width || !camera?.height || !guide?.width || !guide?.height) {
        finish(defaultGuideFrame())
        return
      }
      finish({
        previewWidth:camera.width,
        previewHeight:camera.height,
        x:Math.max(0, (guide.left - camera.left) / camera.width),
        y:Math.max(0, (guide.top - camera.top) / camera.height),
        width:Math.min(1, guide.width / camera.width),
        height:Math.min(1, guide.height / camera.height)
      })
    })
  })
}

async function handleCapture() {
  if (captureBusy.value || finishBusy.value || cancelled) return
  captureBusy.value = true
  try {
    const guideCrop = await measureGuideFrame()
    const captured = await acquirePhoto()
    const original = captured ? { ...captured, guideCrop } : captured
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
      const scanned = await cropImageToGuideFrame(source, source.guideCrop || defaultGuideFrame(), {
        uniApi:uni,
        canvasId:'scanProcessCanvas',
        component:instance?.proxy,
        quality:1,
        resizeCanvas:resizeProcessCanvas,
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

function handlePreview(index) {
  const urls = scannedPages.value.map((page) => page.path).filter(Boolean)
  if (!urls.length) return
  uni.previewImage({ urls, current:scannedPages.value[index]?.path || urls[0] })
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
    const pdfBytes = await createScanPdfFromPathsInline(pages.map((page) => page.path))
    const first = pages[0]
    const pdfName = `扫描文稿-${new Date().toISOString().slice(0,10)}.pdf`
    const scanPdfPath = await saveScanPdfBytes(pdfBytes, pdfName)
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
.scan-page{position:relative;height:100vh;min-height:100vh;overflow:hidden;background:#0d0e12}.camera{position:absolute;inset:0;width:100%;height:100%}.h5-camera{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;font-size:13px}.scan-overlay{position:absolute;z-index:10;inset:0 0 112px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.15);pointer-events:none}.guide-frame{position:relative;width:84vw;height:64vh;border:1px solid rgba(255,255,255,.58)}.corner{position:absolute;width:32px;height:32px;border-color:#fff;border-style:solid}.tl{left:-2px;top:-2px;border-width:3px 0 0 3px}.tr{right:-2px;top:-2px;border-width:3px 3px 0 0}.bl{left:-2px;bottom:-2px;border-width:0 0 3px 3px}.br{right:-2px;bottom:-2px;border-width:0 3px 3px 0}.scan-status{margin-top:17px;padding:8px 13px;color:#fff;font-size:11px;border-radius:999px;background:rgba(0,0,0,.68)}.camera-actions{position:absolute;left:0;right:0;bottom:0;z-index:30;height:112px;background:rgba(10,11,15,.92)}.capture{position:absolute;left:50%;top:14px;display:flex;width:74px;height:74px;align-items:center;justify-content:center;padding:0;border:3px solid #fff;border-radius:50%;background:transparent;transform:translateX(-50%)}.capture.disabled,.capture[disabled]{opacity:.45}.capture-inner{width:56px;height:56px;border-radius:50%;background:#fff}.capture-pressed{transform:translateX(-50%) scale(.94)}.preview-stage{display:flex;height:100%;flex-direction:column;background:var(--color-bg)}.preview-summary{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;padding:16px 18px 12px}.preview-summary>view{display:flex;flex-direction:column}.preview-summary>view text:first-child{color:var(--color-ink);font-size:18px;font-weight:900}.preview-summary>view text:last-child{margin-top:4px;color:var(--color-tertiary);font-size:10px}.preview-summary>text{display:flex;height:30px;align-items:center;padding:0 10px;color:var(--color-brand);font-size:11px;font-weight:900;border-radius:999px;background:var(--color-brand-soft)}.sort-tip{display:flex;flex-shrink:0;align-items:center;gap:7px;margin:0 18px 10px;padding:9px 11px;color:var(--color-muted);font-size:10px;border-radius:7px;background:var(--color-elevated)}.preview-list{min-height:0;flex:1;width:auto;margin:0 18px}.page-card{position:relative;display:grid;height:94px;grid-template-columns:68px minmax(0,1fr) 36px 36px;align-items:center;gap:8px;margin-bottom:10px;padding:8px;color:var(--color-ink);border:1px solid var(--color-quaternary);border-radius:8px;background:var(--color-surface);box-shadow:var(--shadow-card-soft);transition:opacity .15s,border-color .15s,transform .15s}.page-card.dragging{z-index:2;opacity:.55;transform:scale(.98)}.page-card.target{border-color:var(--color-brand);box-shadow:0 0 0 3px rgba(88,86,224,.1)}.page-thumb{position:relative;width:68px;height:78px;overflow:hidden;border-radius:5px;background:var(--color-elevated)}.page-thumb>image{width:100%;height:100%}.crop-progress{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:900;background:rgba(29,31,42,.58)}.crop-progress.error{background:rgba(190,48,65,.72)}.page-copy{display:flex;min-width:0;flex-direction:column}.page-copy text:first-child{font-size:13px;font-weight:900}.page-copy text:nth-child(2){margin-top:6px;overflow:hidden;color:var(--color-muted);font-size:9px;text-overflow:ellipsis;white-space:nowrap}.page-copy text:last-child{margin-top:5px;color:var(--color-tertiary);font-size:8px}.crop-error{display:block;margin-top:4px;overflow:hidden;color:var(--color-danger);font-size:8px;line-height:11px;text-overflow:ellipsis;white-space:nowrap}.crop-state.processing,.crop-state.queued{color:var(--color-brand)!important}.retry-crop{display:flex;width:74px;height:22px;align-items:center;justify-content:center;margin:3px 0 0;padding:0;color:#fff;font-size:9px;font-weight:800;line-height:1;border-radius:5px;background:var(--color-danger)}.delete-page,.drag-handle{display:flex;width:34px;height:42px;align-items:center;justify-content:center;padding:0;border-radius:7px}.delete-page{background:rgba(231,76,94,.1)}.drag-handle{touch-action:none;background:var(--color-elevated)}.list-spacer{height:8px}.preview-actions{display:grid;flex-shrink:0;grid-template-columns:1fr 1.35fr;gap:10px;padding:10px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--color-quaternary);background:var(--color-surface)}.preview-actions button{display:flex;height:48px;align-items:center;justify-content:center;gap:7px;padding:0;font-size:13px;font-weight:900;border-radius:8px}.continue-button{color:var(--color-brand);border:1px solid rgba(88,86,224,.28);background:var(--color-brand-soft)}.finish-button{color:#fff;background:#238458}.process-canvas{position:fixed;left:-2200px;top:-2200px;width:900px;height:900px}
.preview-actions{display:flex;min-height:72px;gap:12px;padding:12px 18px calc(16px + env(safe-area-inset-bottom))}.preview-actions button{box-sizing:border-box;display:flex;width:100%;height:56px;min-width:0;align-items:center;justify-content:center;gap:9px;margin:0!important;padding:0 12px;font-size:14px;line-height:1;font-weight:900;letter-spacing:0;border-radius:8px}.preview-actions button text{display:block;line-height:20px;text-align:center;white-space:nowrap}.preview-actions button[disabled]{opacity:.52}.continue-button{flex:1;color:var(--color-brand);border:1px solid rgba(88,86,224,.32);background:var(--color-surface);box-shadow:0 4px 12px rgba(32,34,48,.06)}.finish-button{flex:1.15;color:#fff;border:1px solid #1f7c55;background:#238458;box-shadow:0 6px 16px rgba(35,132,88,.24)}
.guide-frame{width:82vw;height:116vw}
/* #ifdef H5 */
.scan-page{height:calc(100vh - 44px);min-height:0}
/* #endif */
.process-canvas{left:-10000px;top:-10000px;opacity:0;pointer-events:none}
</style>
