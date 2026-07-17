import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { analyzeDocumentImage } from '../vision/documentScanner'
import { ensureWriteCapacity, fileSize } from '../storage/capacity'

function readLocalBytes(path) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({ filePath: path, success: (result) => resolve(new Uint8Array(result.data)), fail: reject }))
  // #endif

  // #ifndef MP-WEIXIN
  return fetch(path).then((response) => response.arrayBuffer()).then((buffer) => new Uint8Array(buffer))
  // #endif
}

function saveJpegPreview(bytes, pageIndex) {
  // #ifdef MP-WEIXIN
  return new Promise(async (resolve, reject) => {
    const fs = wx.getFileSystemManager()
    const directory = `${wx.env.USER_DATA_PATH}/sign-master/thumbnails`
    const path = `${directory}/pdf-preview-${Date.now()}-${pageIndex + 1}.jpg`
    try {
      await ensureWriteCapacity(bytes.byteLength, { replacementBytes: fileSize(path, fs) })
      try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
      fs.writeFile({ filePath: path, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), success: () => resolve(path), fail: reject })
    } catch (error) { reject(error) }
  })
  // #endif

  // #ifndef MP-WEIXIN
  return Promise.resolve(URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })))
  // #endif
}

function applyMatrix(matrix, x, y) {
  return { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] }
}

function multiplyMatrix(current, next) {
  const [a, b, c, d, e, f] = current
  const [g, h, i, j, k, l] = next
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]
}

function decodePageStreams(page) {
  const contents = page.node.Contents()
  if (!contents) return []
  const streams = contents instanceof PDFArray
    ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index)).filter((stream) => stream instanceof PDFRawStream)
    : contents instanceof PDFRawStream ? [contents] : []
  return streams.map((stream) => new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode()))
}

function parseHorizontalSegments(content) {
  const cleaned = content
    .replace(/%[^\r\n]*/g, ' ')
    .replace(/\((?:\\.|[^\\)])*\)/g, ' ')
    .replace(/<[^<>]*>/g, ' ')
  const tokens = cleaned.match(/-?(?:\d+\.?\d*|\.\d+)|[A-Za-z*']/g) || []
  const operands = []
  const matrices = [[1, 0, 0, 1, 0, 0]]
  let path = []
  let cursor = null
  const segments = []
  const numbers = (count) => operands.splice(Math.max(0, operands.length - count), count).map(Number)
  tokens.forEach((token) => {
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      operands.push(token)
      return
    }
    const matrix = matrices[matrices.length - 1]
    if (token === 'q') matrices.push([...matrix])
    else if (token === 'Q' && matrices.length > 1) matrices.pop()
    else if (token === 'cm' && operands.length >= 6) matrices[matrices.length - 1] = multiplyMatrix(matrix, numbers(6))
    else if (token === 'm' && operands.length >= 2) cursor = applyMatrix(matrix, ...numbers(2))
    else if (token === 'l' && operands.length >= 2 && cursor) {
      const end = applyMatrix(matrix, ...numbers(2))
      path.push({ start: cursor, end })
      cursor = end
    } else if (token === 're' && operands.length >= 4) {
      const [x, y, width, height] = numbers(4)
      const a = applyMatrix(matrix, x, y)
      const b = applyMatrix(matrix, x + width, y)
      const c = applyMatrix(matrix, x, y + height)
      const d = applyMatrix(matrix, x + width, y + height)
      path.push({ start: a, end: b }, { start: c, end: d })
    } else if (token === 'S' || token === 's') {
      segments.push(...path)
      path = []
      cursor = null
    } else if (token === 'n') {
      path = []
      cursor = null
    }
    if (!['m', 'l', 're', 'cm'].includes(token)) operands.length = 0
  })
  return segments
}

function mergePdfLines(lines, pageWidth, pageHeight) {
  const merged = []
  lines.sort((a, b) => a.y - b.y || a.x - b.x).forEach((line) => {
    const duplicate = merged.find((item) => Math.abs(item.y - line.y) < pageHeight * 0.012 && Math.abs(item.x - line.x) < pageWidth * 0.04)
    if (duplicate) {
      duplicate.x = Math.min(duplicate.x, line.x)
      duplicate.right = Math.max(duplicate.right, line.right)
    } else merged.push({ ...line })
  })
  return merged
}

function returnFormLabels(lines) {
  if (lines.length < 3) return lines.map((line, index) => ({ ...line, label: `签字位${index + 1}` }))
  const longest = [...lines].sort((a, b) => (b.right - b.x) - (a.right - a.x))[0]
  const remaining = lines.filter((line) => line !== longest && line.y >= longest.y - 0.012).sort((a, b) => a.x - b.x).slice(-2)
  if (remaining.length !== 2 || (longest.right - longest.x) < 0.48 || Math.abs(remaining[0].y - remaining[1].y) > 0.04) return lines.map((line, index) => ({ ...line, label: `签字位${index + 1}` }))
  return [{ ...longest, label: '家长意见' }, { ...remaining[0], label: '幼儿姓名' }, { ...remaining[1], label: '家长签字' }]
}

export async function detectPdfUnderlineSlots(bytes) {
  const pdf = await PDFDocument.load(bytes)
  const slots = []
  pdf.getPages().forEach((page, pageIndex) => {
    const { width, height } = page.getSize()
    const lines = decodePageStreams(page)
      .flatMap(parseHorizontalSegments)
      .filter((segment) => Math.abs(segment.end.y - segment.start.y) <= Math.max(1.5, height * 0.004))
      .map((segment) => ({ x: Math.min(segment.start.x, segment.end.x), right: Math.max(segment.start.x, segment.end.x), y: height - (segment.start.y + segment.end.y) / 2 }))
      .filter((line) => (line.right - line.x) / width >= 0.12 && (line.right - line.x) / width <= 0.8 && line.y / height >= 0.52)
    const normalized = mergePdfLines(lines, width, height).map((line) => ({ x: line.x / width, right: line.right / width, y: line.y / height }))
    returnFormLabels(normalized).forEach((line, index) => slots.push({
      id: `pdf-slot-${pageIndex + 1}-${index + 1}`,
      label: line.label,
      x: Math.max(0, line.x),
      y: Math.max(0, line.y - 0.035),
      width: Math.min(0.74, Math.max(0.2, line.right - line.x)),
      height: 0.04,
      confidence: 0.8,
      source: 'pdf-underline',
      page: pageIndex + 1
    }))
  })
  return { pdf, slots }
}

function largestPageJpeg(page) {
  const resources = page.node.Resources()
  const xObjects = resources?.lookupMaybe(PDFName.XObject, PDFDict)
  if (!xObjects) return null
  const images = xObjects.entries().map(([, reference]) => page.doc.context.lookup(reference)).filter((object) => {
    if (!(object instanceof PDFRawStream)) return false
    const subtype = object.dict.lookupMaybe(PDFName.of('Subtype'), PDFName)?.toString()
    const filter = object.dict.get(PDFName.of('Filter'))?.toString() || ''
    return subtype === '/Image' && filter.includes('DCTDecode') && object.contents[0] === 0xff && object.contents[1] === 0xd8
  })
  return images.sort((a, b) => b.contents.length - a.contents.length)[0]?.contents || null
}

export async function analyzePdfDocument(file, options = {}) {
  const bytes = await readLocalBytes(file.path)
  const { pdf, slots: vectorSlots } = await detectPdfUnderlineSlots(bytes)
  const pages = []
  const imageSlots = []
  for (let pageIndex = 0; pageIndex < pdf.getPageCount(); pageIndex += 1) {
    const page = pdf.getPage(pageIndex)
    const jpeg = largestPageJpeg(page)
    let previewPath = ''
    let pageWidth = page.getWidth()
    let pageHeight = page.getHeight()
    if (jpeg) {
      previewPath = await saveJpegPreview(jpeg, pageIndex)
      const analyzed = await analyzeDocumentImage({ name: `${file.name}-第${pageIndex + 1}页.jpg`, path: previewPath, kind: 'image', extension: 'jpg' }, options)
      pageWidth = analyzed.width || pageWidth
      pageHeight = analyzed.height || pageHeight
      imageSlots.push(...(analyzed.detectedSlots || []).map((slot, index) => ({ ...slot, id: `${slot.id}-pdf-${pageIndex + 1}-${index + 1}`, page: pageIndex + 1 })))
    }
    pages.push({ name: `${file.name}-第${pageIndex + 1}页`, path: file.path, previewPath, kind: 'pdf', extension: 'pdf', width: pageWidth, height: pageHeight })
  }
  const detectedSlots = imageSlots.length ? imageSlots : vectorSlots
  return { ...file, pages, totalPages: pages.length, width: pages[0]?.width || 595, height: pages[0]?.height || 842, detectedSlots }
}
