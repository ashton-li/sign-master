<template>
  <PageShell :tab="false" compact>
    <view class="preview-root">
      <view class="finish-head">
        <view class="done-mark"><SvgIcon name="check" :size="25" color="#ffffff" /></view>
        <view class="finish-copy"><text class="finish-title">签署完成</text><text class="finish-desc">请核对预览后选择导出格式</text></view>
      </view>

      <view class="preview-main">
        <view class="preview-card">
          <view class="preview-paper">
            <image v-if="currentPagePreview" class="preview-source" :src="currentPagePreview" mode="scaleToFill" />
            <view v-else class="preview-pdf"><SvgIcon name="file" :size="36" /><text>{{ signingStore.document?.name }}</text></view>
            <view v-for="layer in currentPageLayers" :key="layer.id" class="preview-sign" :style="layerStyle(layer)">
              <image v-if="layer.snapshot?.pngPath" class="preview-sign-image" :src="layer.snapshot.pngPath" mode="aspectFit" />
              <SignatureInk v-else :canvas-id="`preview-${layer.id}`" :snapshot="layer.snapshot" :width="Math.max(1, Math.round(layer.width))" :height="Math.max(1, Math.round(layer.height))" fluid />
            </view>
          </view>
          <view v-if="signingStore.document?.totalPages > 1" class="preview-pages"><button :disabled="previewPage <= 1" @click="previewPage -= 1">上一页</button><text>{{ previewPage }}/{{ signingStore.document.totalPages }}</text><button :disabled="previewPage >= signingStore.document.totalPages" @click="previewPage += 1">下一页</button></view>
        </view>
      </view>

      <view v-if="!signingStore.appliedTemplateId" class="action-list">
        <button class="action-row" @click="handleSaveTemplate"><SvgIcon name="template" :size="18" /><text class="action-title">保存模板</text></button>
        <button :class="['action-row', { saved: signatureSaved }]" :disabled="signatureSaved" @click="handleSaveSignature"><SvgIcon :name="signatureSaved ? 'check' : 'sign'" :size="18" :color="signatureSaved ? '#7d8290' : '#5856e0'" /><text class="action-title">{{ signatureSaved ? '签名已保存' : '保存签名' }}</text></button>
      </view>

      <view class="export-panel">
        <view class="format-head"><text class="format-title">导出格式</text><text class="format-note">全程仅在本机处理</text></view>
        <view class="format-row">
          <button v-for="format in formats" :key="format.value" class="format-btn" :class="{ active: signingStore.exportFormat === format.value }" :disabled="exporting" @click="handleFormatChange(format.value)"><SvgIcon :name="format.icon" :size="20" :color="signingStore.exportFormat === format.value ? '#5856e0' : '#8d91a2'" /><text>{{ format.label }}</text></button>
        </view>
        <view v-if="statusText" :class="['export-status', { error: exportError }]">{{ statusText }}</view>
        <view class="export-actions">
          <button class="primary-btn" :disabled="exporting" @click="handleExport"><SvgIcon name="save" :size="20" color="#ffffff" /><text>{{ exporting ? '正在生成…' : '导出文件' }}</text></button>
          <button class="share-btn" :disabled="exporting" @click="handleShare"><SvgIcon name="share" :size="20" /><text>{{ shareButtonText }}</text></button>
          <button class="home-button" @click="handleHome"><SvgIcon name="arrowLeft" :size="19" color="#c75d28" /><text>回到首页</text></button>
        </view>
      </view>
    </view>
    <canvas id="exportCanvas" canvas-id="exportCanvas" class="export-canvas" :style="{ width: `${exportSize.width}px`, height: `${exportSize.height}px` }" :width="exportSize.width" :height="exportSize.height" />
  </PageShell>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import PageShell from '../../components/PageShell.vue'
import SignatureInk from '../../components/SignatureInk.vue'
import SvgIcon from '../../components/SvgIcon.vue'
import { exportSignedPdf, saveExportedBytes } from '../../core/export/documentExporter'
import { createJpegPdfFromPaths } from '../../core/export/imagePdf'
import { persistLocalFile, promoteDocumentFiles } from '../../core/file/sourcePicker'
import { readLocal } from '../../core/storage/localRepository'
import { saveProvenanceRecord } from '../../core/security/provenance'
import { getIdentity } from '../../core/security/identity'
import { attachFileEvidence, createFileEvidence, stampFileEvidence } from '../../core/security/fileEvidence'
import { embedDctWatermark, systemWatermark, watermarkToken } from '../../core/security/watermark'
import { useFilesStore } from '../../stores/files'
import { useSigningStore } from '../../stores/signing'

const signingStore = useSigningStore()
const filesStore = useFilesStore()
const instance = getCurrentInstance()
const exporting = ref(false)
const exportDone = ref(false)
const exportError = ref(false)
const statusText = ref('')
const exportedPath = ref('')
const exportedName = ref('')
const exportedFormat = ref('')
const signatureSaved = ref(false)
const previewPage = ref(signingStore.document?.page || 1)
const exportSize = reactive({ width: 1200, height: 1600 })
const formats = computed(() => signingStore.document?.kind === 'pdf' || signingStore.document?.totalPages > 1
  ? [{ value: 'pdf', label: 'PDF', icon: 'pdf' }]
  : [{ value: 'jpg', label: 'JPEG', icon: 'cameraFile' }, { value: 'pdf', label: 'PDF', icon: 'pdf' }, { value: 'png', label: 'PNG', icon: 'photo' }])
const currentPageInfo = computed(() => signingStore.document?.pages?.[Math.max(0, previewPage.value - 1)] || signingStore.document || {})
const currentPagePath = computed(() => currentPageInfo.value?.path || signingStore.document?.path || '')
const currentPagePreview = computed(() => currentPageInfo.value?.previewPath || (signingStore.document?.kind === 'image' ? currentPagePath.value : ''))
const currentPageLayers = computed(() => signingStore.layers.filter((layer) => !layer.page || layer.page === previewPage.value))
const shareReady = computed(() => Boolean(exportedPath.value && exportedFormat.value === signingStore.exportFormat))
const shareButtonText = computed(() => exporting.value ? '正在生成…' : (shareReady.value ? '发送给好友' : '分享好友'))
let recordedExportKey = ''

onLoad(() => {
  const firstFormat = formats.value[0]?.value
  if (firstFormat) signingStore.exportFormat = firstFormat
})

function layerStyle(layer) {
  return { left: `${layer.x / 330 * 100}%`, top: `${layer.y / 500 * 100}%`, width: `${layer.width / 330 * 100}%`, height: `${layer.height / 500 * 100}%`, opacity: layer.opacity, transform: `rotate(${layer.rotation || 0}deg)` }
}

function setStatus(message, isError = false) {
  statusText.value = message
  exportError.value = isError
}

function handleSaveTemplate() {
  uni.navigateTo({
    url: '/pages/sign/save-template',
    events: {
      templateSaved: ({ name }) => { signatureSaved.value = true; setStatus(`模板“${name}”及关联签名已保存`) }
    }
  })
}

function handleSaveSignature() {
  const hasSignatures = signingStore.layers.some((layer) => layer.snapshot?.strokes?.length)
  if (!hasSignatures) {
    setStatus('当前工程没有可保存的手写签字', true)
    return
  }
  uni.navigateTo({
    url: '/pages/sign/save-signatures',
    events: {
      signaturesSaved: ({ count }) => { signatureSaved.value = true; setStatus(`签名已保存 ${count} 个签字到“我的签名”`) }
    }
  })
}

function handleFormatChange(format) {
  if (exporting.value || signingStore.exportFormat === format) return
  signingStore.exportFormat = format
  exportedPath.value = ''
  exportedName.value = ''
  exportedFormat.value = ''
}

async function generateExport(options = {}) {
  if (exporting.value) return
  exporting.value = true
  exportDone.value = false
  if (!options.silent) setStatus('')
  try {
    const promotedDocument = await promoteDocumentFiles(signingStore.document, uni)
    signingStore.replaceDocumentFiles(promotedDocument)
    const manifest = signingStore.buildExport(signingStore.exportFormat)
    const evidence = createFileEvidence({
      documentId: signingStore.document.id,
      fileName: manifest.fileName,
      format: manifest.format,
      layers: signingStore.layers
    })
    let outputPath
    if (manifest.format === 'pdf') {
      const rawBytes = signingStore.document.kind === 'image'
        ? (await exportImageDocumentAsPdf()).bytes
        : await exportSignedPdf({ document: signingStore.document, layers: signingStore.layers })
      const bytes = attachFileEvidence(rawBytes, evidence).bytes
      outputPath = await saveExportedBytes(bytes, manifest.fileName, { download: options.present !== false })
      // #ifdef MP-WEIXIN
      if (options.present !== false) await new Promise((resolve, reject) => uni.openDocument({ filePath: outputPath, showMenu: true, success: resolve, fail: reject }))
      // #endif
    } else {
      const exportId = `export-${Date.now()}`
      const renderedPath = await renderImage(currentPagePath.value, manifest.format, currentPageLayers.value)
      const persisted = await persistLocalFile({ id:exportId, name:manifest.fileName, path:renderedPath, kind:'image', extension:manifest.format }, uni, { category:'exports' })
      const stamped = await stampFileEvidence(persisted.path, evidence)
      outputPath = stamped.path
      if (options.present !== false) await presentExportedImage(outputPath, manifest.fileName)
    }
    exportedPath.value = outputPath || signingStore.document.path
    exportedName.value = manifest.fileName
    exportedFormat.value = manifest.format
    if (options.record !== false) await recordExportResult(manifest, outputPath, options)
    else if (!options.silent) setStatus(options.message || '导出完成')
    exportDone.value = true
    return exportedPath.value
  } catch (error) {
    if (!options.silent) setStatus(`导出失败：${error?.message || error?.errMsg || '未知错误'}`, true)
  } finally {
    exporting.value = false
  }
}

async function recordExportResult(manifest, outputPath, options = {}) {
  const path = outputPath || signingStore.document.path
  const recordKey = `${manifest.format}:${path}`
  if (recordedExportKey === recordKey) {
    if (!options.silent) setStatus(options.message || '导出完成')
    return
  }
  recordedExportKey = recordKey
  try {
    saveProvenanceRecord({ documentId:signingStore.document.id, fileName:manifest.fileName, path, format:manifest.format, layers:signingStore.layers })
    if (readLocal('save-signed-files', true)) {
      const fileRecord = { sourceId:signingStore.document.id, path }
      if (!await filesStore.requestCapacity(fileRecord)) {
        recordedExportKey = ''
        return
      }
      const thumbnail = await createSignedThumbnail()
      filesStore.addSignedFile({
        name:manifest.fileName.replace(/\.[^.]+$/, ''),
        fileName:manifest.fileName,
        sourceId:signingStore.document.id,
        path,
        kind:manifest.format === 'pdf' ? 'pdf' : 'image',
        extension:manifest.format,
        thumbnail,
        signatures:signingStore.layers.length,
        project:signingStore.getProjectSnapshot()
      })
      if (!options.silent) setStatus(options.message || '导出完成，文件已保存在本机')
    } else if (!options.silent) {
      setStatus(options.message || '导出完成')
    }
  } catch (error) {
    if (recordedExportKey === recordKey) recordedExportKey = ''
    throw error
  }
}

async function handleExport() {
  let hasPreparedFile = false
  // #ifdef MP-WEIXIN
  hasPreparedFile = Boolean(exportedPath.value && exportedFormat.value === signingStore.exportFormat)
  // #endif
  if (!hasPreparedFile) return generateExport({ present:true, record:true })
  exporting.value = true
  setStatus('')
  try {
    // #ifdef MP-WEIXIN
    if (exportedFormat.value === 'pdf') {
      await new Promise((resolve, reject) => uni.openDocument({ filePath:exportedPath.value, showMenu:true, success:resolve, fail:reject }))
    } else {
      await presentExportedImage(exportedPath.value, exportedName.value)
    }
    // #endif
    const manifest = { fileName:exportedName.value, format:exportedFormat.value }
    await recordExportResult(manifest, exportedPath.value, { message:'导出完成，已复用准备好的文件' })
    exportDone.value = true
    return exportedPath.value
  } catch (error) {
    setStatus(`导出失败：${error?.message || error?.errMsg || '未知错误'}`, true)
  } finally {
    exporting.value = false
  }
}

async function generateShareOnDemand() {
  const filePath = await generateExport({ present:false, record:false, silent:true })
  if (filePath) setStatus('分享文件已生成，请再次点击“发送给好友”')
  else setStatus('分享文件生成失败，请重试', true)
}

function recordPreparedExport() {
  if (!exportedPath.value || !exportedFormat.value || !exportedName.value) return
  const outputPath = exportedPath.value
  const manifest = { fileName:exportedName.value, format:exportedFormat.value }
  setTimeout(() => {
    recordExportResult(manifest, outputPath, { silent:true }).catch(() => {})
  }, 0)
}

function handleShare() {
  // #ifdef MP-WEIXIN
  const imageFormat = ['jpg', 'jpeg', 'png'].includes(signingStore.exportFormat)
  const supported = typeof wx !== 'undefined' && (imageFormat
    ? typeof wx.showShareImageMenu === 'function'
    : typeof wx.shareFileMessage === 'function')
  if (!supported) {
    uni.showModal({ title: '当前微信版本不支持', content: '请升级微信后使用“分享好友”，或先导出后在文件预览菜单中分享。', showCancel: false })
    return
  }
  if (!exportedPath.value || exportedFormat.value !== signingStore.exportFormat) {
    generateShareOnDemand()
    return
  }
  shareCurrentFile()
  recordPreparedExport()
  // #endif
  // #ifndef MP-WEIXIN
  setStatus('浏览器不支持微信文件直发，请在微信小程序中使用', true)
  // #endif
}

function shareCurrentFile() {
  try {
    if (['jpg', 'jpeg', 'png'].includes(exportedFormat.value)) {
      wx.showShareImageMenu({
        path:exportedPath.value,
        success:() => setStatus('已打开微信图片分享'),
        fail:(error) => {
          const message = String(error?.errMsg || error?.message || '')
          if (!/cancel/i.test(message)) setStatus(`分享失败：${message || '请稍后重试'}`, true)
        }
      })
      return
    }
    wx.shareFileMessage({
      filePath: exportedPath.value,
      fileName: exportedName.value || signingStore.document?.name || '签署文件',
      success: () => setStatus('已打开微信好友分享'),
      fail: (error) => {
        const message = String(error?.errMsg || error?.message || '')
        if (!/cancel/i.test(message)) setStatus(`分享失败：${message || '请稍后重试'}`, true)
      }
    })
  } catch (error) {
    setStatus(`分享失败：${error?.errMsg || error?.message || '请稍后重试'}`, true)
  }
}

async function exportImageDocumentAsPdf() {
  const sourcePages = signingStore.document.pages?.length ? signingStore.document.pages : [signingStore.document]
  const jpegPaths = []
  for (let index = 0; index < sourcePages.length; index += 1) {
    const pageLayers = signingStore.layers.filter((layer) => !layer.page || layer.page === index + 1)
    jpegPaths.push(await renderImage(sourcePages[index].path, 'jpg', pageLayers, false))
  }
  return { bytes: await createJpegPdfFromPaths(jpegPaths), thumbnailSource: jpegPaths[0] || '' }
}

async function createSignedThumbnail() {
  const sourcePath = currentPagePreview.value || currentPagePath.value
  if (!sourcePath) return ''
  try {
    const info = await new Promise((resolve, reject) => uni.getImageInfo({ src:sourcePath, success:resolve, fail:reject }))
    const scale = Math.min(1, 360 / Math.max(info.width, info.height))
    exportSize.width = Math.max(1, Math.round(info.width * scale))
    exportSize.height = Math.max(1, Math.round(info.height * scale))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 16))
    const ctx = uni.createCanvasContext('exportCanvas', instance?.proxy)
    ctx.setFillStyle('#ffffff')
    ctx.fillRect(0, 0, exportSize.width, exportSize.height)
    ctx.drawImage(sourcePath, 0, 0, exportSize.width, exportSize.height)
    currentPageLayers.value.forEach((layer) => drawLayer(ctx, layer))
    await new Promise((resolve) => ctx.draw(false, resolve))
    const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
      canvasId:'exportCanvas',
      width:exportSize.width,
      height:exportSize.height,
      destWidth:exportSize.width,
      destHeight:exportSize.height,
      fileType:'jpg',
      quality:.58,
      success:resolve,
      fail:reject
    }, instance?.proxy))
    const persisted = await persistLocalFile({
      id:`thumb-${signingStore.document.id}`,
      name:`thumb-${signingStore.document.id}.jpg`,
      path:result.tempFilePath,
      kind:'image',
      extension:'jpg'
    }, uni, { category:'thumbnails' })
    return persisted.path || result.tempFilePath
  } catch {
    return ''
  }
}

async function renderImage(sourcePath, format, layers = []) {
  const info = await new Promise((resolve, reject) => uni.getImageInfo({ src: sourcePath, success: resolve, fail: reject }))
  const scale = Math.min(1, 1800 / Math.max(info.width, info.height))
  exportSize.width = Math.max(1, Math.round(info.width * scale))
  exportSize.height = Math.max(1, Math.round(info.height * scale))
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 16))
  const ctx = uni.createCanvasContext('exportCanvas', instance?.proxy)
  ctx.setFillStyle('#ffffff')
  ctx.fillRect(0, 0, exportSize.width, exportSize.height)
  ctx.drawImage(sourcePath, 0, 0, exportSize.width, exportSize.height)
  layers.forEach((layer) => drawLayer(ctx, layer))
  await new Promise((resolve) => ctx.draw(false, resolve))
  await applyImageWatermark(layers)
  const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
    canvasId: 'exportCanvas',
    width: exportSize.width,
    height: exportSize.height,
    destWidth: exportSize.width,
    destHeight: exportSize.height,
    fileType: format === 'jpg' ? 'jpg' : 'png',
    quality: 0.95,
    success: resolve,
    fail: reject
  }, instance?.proxy))
  return result.tempFilePath
}

async function presentExportedImage(filePath, outputName) {
  // #ifdef MP-WEIXIN
  await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject }))
  // #endif
  // #ifndef MP-WEIXIN
  const link = document.createElement('a')
  link.href = filePath
  link.download = outputName || `签署文件_${Date.now()}.jpg`
  link.click()
  // #endif
}

async function applyImageWatermark(layers) {
  const token = watermarkToken(layers.find((layer) => layer.snapshot?.attestation)?.snapshot?.attestation)
  if (typeof uni.canvasGetImageData !== 'function' || typeof uni.canvasPutImageData !== 'function') return false
  try {
    const pixels = await new Promise((resolve, reject) => uni.canvasGetImageData({ canvasId:'exportCanvas', x:0, y:0, width:exportSize.width, height:exportSize.height, success:resolve, fail:reject }, instance?.proxy))
    const system = systemWatermark()
    const systemMarked = embedDctWatermark(pixels.data, exportSize.width, exportSize.height, system.token, system.key, system.options)
    const ownerMarked = token ? embedDctWatermark(systemMarked.data, exportSize.width, exportSize.height, token, getIdentity().secret) : systemMarked
    if (!ownerMarked.embedded) return false
    await new Promise((resolve, reject) => uni.canvasPutImageData({ canvasId:'exportCanvas', x:0, y:0, width:exportSize.width, height:exportSize.height, data:ownerMarked.data, success:resolve, fail:reject }, instance?.proxy))
    return true
  } catch {
    return false
  }
}

function drawLayer(ctx, layer) {
  const snapshot = layer.snapshot
  if (!snapshot?.strokes?.length) return
  const sx = exportSize.width / 330
  const sy = exportSize.height / 500
  ctx.save()
  ctx.translate((layer.x + layer.width / 2) * sx, (layer.y + layer.height / 2) * sy)
  ctx.rotate((layer.rotation || 0) * Math.PI / 180)
  ctx.scale(layer.width * sx / snapshot.width, layer.height * sy / snapshot.height)
  ctx.translate(-snapshot.width / 2, -snapshot.height / 2)
  snapshot.strokes.forEach((stroke) => {
    if (!stroke.points.length) return
    ctx.setStrokeStyle(stroke.color || snapshot.color)
    ctx.setLineWidth(stroke.width)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y))
    ctx.stroke()
  })
  ctx.restore()
}

function handleHome() { uni.switchTab({ url: '/pages/home/index' }) }
</script>

<style scoped>
.preview-root { padding-bottom: calc(18px + env(safe-area-inset-bottom)); }
.finish-head { display: flex; align-items: center; gap: 12px; padding: 4px 2px 12px; }
.done-mark { display: flex; width: 46px; height: 46px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 50%; background: #24a865; box-shadow: 0 6px 16px rgba(36,168,101,.22); }
.finish-copy { display: flex; min-width: 0; flex-direction: column; }.finish-title { color: var(--color-ink); font-size: 19px; font-weight: 900; }.finish-desc { margin-top: 3px; color: var(--color-tertiary); font-size: 11px; }
.preview-card { padding: 8px; border: 1px solid rgba(0,0,0,.06); border-radius: 8px; background: #eef0f5; }
.preview-paper { position: relative; width: 306px; height: 430px; max-width: 100%; margin: auto; overflow: hidden; background: #fff; box-shadow: 0 4px 14px rgba(26,28,38,.1); }
.preview-source { width: 100%; height: 100%; }.preview-pdf { display: flex; height: 100%; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--color-brand); font-size: 11px; }.preview-sign { position: absolute; }
.preview-pages { display: flex; align-items: center; justify-content: center; gap: 14px; height: 36px; color: var(--color-tertiary); font-size: 10px; }.preview-pages button { min-height: 30px; color: var(--color-brand); font-size: 10px; }.preview-pages button[disabled] { opacity: .3; }
.action-list { margin-top: 10px; overflow: hidden; border: 1px solid rgba(0,0,0,.06); border-radius: 8px; background: #fff; }
.action-row { display: flex; width: 100%; min-height: 46px; align-items: center; justify-content:center;gap:7px;padding:7px 10px;text-align:center;border-bottom: 1px solid #eceef3; }.action-row:last-child { border-bottom: 0; }
.action-title { color: var(--color-ink); font-size: 12px; font-weight: 900;line-height:18px;text-align:center }.chevron { color: #a8abb7; font-size: 24px; }
.action-row.saved{color:#7d8290;border-color:#d9dce3!important;background:#eef0f4}.action-row.saved .action-title{color:#7d8290}.action-row[disabled]{opacity:1}
.export-panel { margin-top: 10px; padding: 14px; border: 1px solid rgba(0,0,0,.06); border-radius: 8px; background: #fff; }
.format-head { display: flex; align-items: center; justify-content: space-between; }.format-title { color: var(--color-ink); font-size: 13px; font-weight: 900; }.format-note { color: var(--color-tertiary); font-size: 9px; }
.format-row { display: flex; gap: 8px; margin-top: 10px; }.format-btn { flex: 1; height: 42px; color: var(--color-tertiary); font-size: 12px; font-weight: 800; border: 1px solid #d9dce5; border-radius: 7px; background: #fff; }.format-btn.active { color: var(--color-brand); border-color: var(--color-brand); background: var(--color-brand-soft); }
.export-status { margin-top: 10px; padding: 8px 10px; color: #18794e; font-size: 10px; text-align: center; border-radius: 6px; background: #e9f9f0; }.export-status.error { color: #c53030; background: #fff0f0; }
.export-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.primary-btn,.share-btn { display: flex; width: 100%; height: 44px; align-items: center; justify-content: center; gap: 6px; color: #fff; font-size: 12px; font-weight: 900; border-radius: 8px; }.primary-btn{background:var(--color-brand);box-shadow:0 6px 16px rgba(88,86,224,.2)}.share-btn{color:var(--color-brand);border:1px solid rgba(88,86,224,.35);background:#fff}.primary-btn[disabled],.share-btn[disabled] { opacity: .6; }
.home-button { width: 100%; height: 44px; margin-top: 8px; color: var(--color-brand); font-size: 12px; font-weight: 900; border: 1px solid var(--color-brand); border-radius: 8px; }
.export-canvas { position: fixed; left: -4000px; top: -4000px; }
.preview-root{display:flex;height:100%;min-height:0;flex-direction:column;overflow:hidden;padding-bottom:0}.finish-head{height:58px;flex-shrink:0;padding:4px 2px 8px}.done-mark{width:42px;height:42px}.finish-title{font-size:17px}.preview-main{display:flex;min-height:0;flex:1}.preview-card{display:flex;width:100%;min-height:0;flex-direction:column;padding:6px}.preview-paper{width:auto;height:100%;max-width:100%;max-height:100%;aspect-ratio:330/500}.preview-sign-image{width:100%;height:100%}.preview-pages{height:28px}.action-list{display:grid;height:46px;flex-shrink:0;margin-top:7px;grid-template-columns:1fr 1fr;gap:8px;border:0;background:transparent}.action-row{min-height:46px;flex-direction:row;justify-content:center;gap:6px;padding:6px 8px;text-align:center;border:1px solid rgba(88,86,224,.14)!important;border-radius:8px;background:#fff}.action-title{font-size:11px;white-space:nowrap}.chevron{display:none}.export-panel{flex-shrink:0;margin-top:7px;padding:9px}.format-row{margin-top:7px}.format-btn{display:flex;height:38px;align-items:center;justify-content:center;gap:5px}.export-status{margin-top:6px;padding:5px 8px}.export-actions{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px}.primary-btn,.share-btn,.home-button{display:flex;height:42px;align-items:center;justify-content:center;gap:4px;margin:0;padding:0;font-size:10px;line-height:1;text-align:center}.share-btn{color:#168356;border-color:#96d5b8;background:#f1fbf5}.home-button{color:#c75d28;border-color:#efb18f;background:#fff6f0}
</style>
