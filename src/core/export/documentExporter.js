import { PDFDocument, rgb } from 'pdf-lib'
import { buildSvgPath } from '../signature/path'
import { ensureWriteCapacity, fileSize } from '../storage/capacity'

function readSourceBytes(path) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      success: (result) => resolve(result.data),
      fail: reject
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  return fetch(path).then((response) => response.arrayBuffer())
  // #endif
}

function drawSignatureLayers(page, layers, editorSize = { width: 330, height: 500 }) {
  const pageWidth = page.getWidth()
  const pageHeight = page.getHeight()
  layers.filter((layer) => layer.visible !== false).forEach((layer) => {
    const snapshot = layer.snapshot
    if (!snapshot?.strokes?.length) return
    const targetWidth = layer.width * pageWidth / editorSize.width
    const targetHeight = layer.height * pageHeight / editorSize.height
    const scale = Math.min(targetWidth / snapshot.width, targetHeight / snapshot.height)
    const x = layer.x * pageWidth / editorSize.width
    const y = pageHeight - (layer.y * pageHeight / editorSize.height) - targetHeight
    snapshot.strokes.forEach((stroke) => {
      const path = buildSvgPath(stroke.points)
      if (!path) return
      page.drawSvgPath(path, {
        x,
        y,
        scale,
        borderColor: hexToRgb(stroke.color || snapshot.color),
        borderWidth: Math.max(0.5, stroke.width * scale),
        opacity: layer.opacity ?? 1
      })
    })
  })
}

function hexToRgb(value = '#1a1c26') {
  const hex = value.replace('#', '').padEnd(6, '0')
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
}

export function detectImageFormat(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png'
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg'
  if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) return 'webp'
  if (data[0] === 0x42 && data[1] === 0x4d) return 'bmp'
  return 'unknown'
}

async function embedRasterImage(pdf, bytes) {
  const format = detectImageFormat(bytes)
  if (format === 'png') return pdf.embedPng(bytes)
  if (format === 'jpg') return pdf.embedJpg(bytes)
  throw new Error(`PDF_EXPORT_CONVERT_REQUIRED:${format}`)
}

async function createPdfDocument(project) {
  const sourceBytes = await readSourceBytes(project.document.path)
  if (project.document.kind === 'pdf') return PDFDocument.load(sourceBytes)

  const pdf = await PDFDocument.create()
  const sources = project.document.pages?.length ? project.document.pages : [project.document]
  for (const source of sources) {
    const bytes = source.path === project.document.path ? sourceBytes : await readSourceBytes(source.path)
    const image = await embedRasterImage(pdf, bytes)
    const ratio = image.width / image.height
    const page = pdf.addPage(ratio > 1 ? [842, 595] : [595, 842])
    const scale = Math.min(page.getWidth() / image.width, page.getHeight() / image.height)
    const width = image.width * scale
    const height = image.height * scale
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height })
  }
  return pdf
}

export async function exportSignedPdf(project) {
  const pdf = await createPdfDocument(project)
  const attestations = project.layers.map((layer) => layer.snapshot?.attestation).filter(Boolean)
  pdf.setProducer('signMaster 1.0')
  pdf.setSubject(attestations.length ? `signMaster provenance ${attestations.map((item) => item.mac.slice(0, 16)).join(',')}` : 'signMaster local signature')
  pdf.setKeywords(['signMaster', 'local-signature', ...attestations.map((item) => `SM1:${item.ownerHash.slice(0, 16)}:${item.mac.slice(0, 16)}`)])
  pdf.getPages().forEach((page, index) => {
    drawSignatureLayers(page, project.layers.filter((layer) => !layer.page || layer.page === index + 1))
  })
  return pdf.save()
}

export function saveExportedBytes(bytes, fileName, options = {}) {
  // #ifdef MP-WEIXIN
  return new Promise(async (resolve, reject) => {
    const fs = wx.getFileSystemManager()
    const directory = `${wx.env.USER_DATA_PATH}/sign-master/exports`
    const filePath = `${directory}/${fileName}`
    try {
      await ensureWriteCapacity(bytes.byteLength, { replacementBytes: fileSize(filePath, fs) })
    } catch (error) {
      reject(error)
      return
    }
    try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
    fs.writeFile({
      filePath,
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      success: () => resolve(filePath),
      fail: reject
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  if (options.download !== false) {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return Promise.resolve(fileName)
  }
  return Promise.resolve(url)
  // #endif
}
