import { ensureWriteCapacity } from '../storage/capacity.js'

function luminance(data, offset) {
  return data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function emptyPaperQuad(width, height) {
  return {
    topLeft:{ x:0, y:0 }, topRight:{ x:width - 1, y:0 },
    bottomRight:{ x:width - 1, y:height - 1 }, bottomLeft:{ x:0, y:height - 1 },
    confidence:0,
    method:'paper-luma'
  }
}

export function detectPaperQuad(imageData, width, height) {
  if (!imageData?.length || width < 24 || height < 24) return emptyPaperQuad(width, height)
  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / 180))
  const gridWidth = Math.ceil(width / sampleStep)
  const gridHeight = Math.ceil(height / sampleStep)
  const luma = new Uint8Array(gridWidth * gridHeight)
  const chroma = new Uint8Array(gridWidth * gridHeight)
  const border = []

  for (let gy = 0; gy < gridHeight; gy += 1) {
    const y = Math.min(height - 1, gy * sampleStep)
    for (let gx = 0; gx < gridWidth; gx += 1) {
      const x = Math.min(width - 1, gx * sampleStep)
      const sourceOffset = (y * width + x) * 4
      const index = gy * gridWidth + gx
      const red = imageData[sourceOffset]
      const green = imageData[sourceOffset + 1]
      const blue = imageData[sourceOffset + 2]
      luma[index] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114)
      chroma[index] = Math.max(red, green, blue) - Math.min(red, green, blue)
      if (gx < 2 || gy < 2 || gx >= gridWidth - 2 || gy >= gridHeight - 2) border.push(luma[index])
    }
  }

  const background = median(border)
  const threshold = Math.max(132, Math.min(238, background + 18))
  const mask = new Uint8Array(gridWidth * gridHeight)
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = luma[index] >= threshold && chroma[index] <= 78 ? 1 : 0
  }

  const labels = new Int32Array(mask.length)
  labels.fill(-1)
  const queue = new Int32Array(mask.length)
  const components = []
  let label = 0
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start] !== -1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    labels[start] = label
    let count = 0
    let minX = gridWidth
    let minY = gridHeight
    let maxX = 0
    let maxY = 0
    while (head < tail) {
      const current = queue[head++]
      const x = current % gridWidth
      const y = Math.floor(current / gridWidth)
      count += 1
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      const neighbors = [current - 1, current + 1, current - gridWidth, current + gridWidth]
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || !mask[next] || labels[next] !== -1) continue
        const nextX = next % gridWidth
        if (Math.abs(nextX - x) > 1) continue
        labels[next] = label
        queue[tail++] = next
      }
    }
    components.push({ label, count, minX, minY, maxX, maxY })
    label += 1
  }

  const component = components
    .map((item) => {
      const boxArea = (item.maxX - item.minX + 1) * (item.maxY - item.minY + 1)
      const areaRatio = item.count / mask.length
      const boxRatio = boxArea / mask.length
      const fill = item.count / boxArea
      const touches = Number(item.minX === 0) + Number(item.minY === 0) + Number(item.maxX === gridWidth - 1) + Number(item.maxY === gridHeight - 1)
      const score = item.count * fill * (touches >= 3 ? 0.18 : 1)
      return { ...item, areaRatio, boxRatio, fill, touches, score }
    })
    .filter((item) => item.areaRatio >= 0.07 && item.boxRatio >= 0.12 && item.boxRatio <= 0.96 && item.fill >= 0.38)
    .sort((a, b) => b.score - a.score)[0]
  if (!component) return emptyPaperQuad(width, height)

  const rowLeft = new Array(gridHeight).fill(Infinity)
  const rowRight = new Array(gridHeight).fill(-Infinity)
  const columnTop = new Array(gridWidth).fill(Infinity)
  const columnBottom = new Array(gridWidth).fill(-Infinity)
  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== component.label) continue
    const x = index % gridWidth
    const y = Math.floor(index / gridWidth)
    rowLeft[y] = Math.min(rowLeft[y], x); rowRight[y] = Math.max(rowRight[y], x)
    columnTop[x] = Math.min(columnTop[x], y); columnBottom[x] = Math.max(columnBottom[x], y)
  }
  const boxWidth = component.maxX - component.minX + 1
  const boxHeight = component.maxY - component.minY + 1
  const xBand = Math.max(2, Math.round(boxWidth * 0.14))
  const yBand = Math.max(2, Math.round(boxHeight * 0.14))
  const valid = (value) => Number.isFinite(value) && value >= 0
  const values = (items, from, to) => items.slice(Math.max(0, from), Math.min(items.length, to)).filter(valid)
  const toSourceX = (value) => Math.max(0, Math.min(width - 1, Math.round(value * sampleStep)))
  const toSourceY = (value) => Math.max(0, Math.min(height - 1, Math.round(value * sampleStep)))
  const topLeft = {
    x:toSourceX(median(values(rowLeft, component.minY, component.minY + yBand))),
    y:toSourceY(median(values(columnTop, component.minX, component.minX + xBand)))
  }
  const topRight = {
    x:toSourceX(median(values(rowRight, component.minY, component.minY + yBand))),
    y:toSourceY(median(values(columnTop, component.maxX - xBand + 1, component.maxX + 1)))
  }
  const bottomLeft = {
    x:toSourceX(median(values(rowLeft, component.maxY - yBand + 1, component.maxY + 1))),
    y:toSourceY(median(values(columnBottom, component.minX, component.minX + xBand)))
  }
  const bottomRight = {
    x:toSourceX(median(values(rowRight, component.maxY - yBand + 1, component.maxY + 1))),
    y:toSourceY(median(values(columnBottom, component.maxX - xBand + 1, component.maxX + 1)))
  }
  const confidence = Math.min(0.98, 0.45 + component.fill * 0.3 + Math.min(0.2, component.areaRatio))
  return { topLeft, topRight, bottomRight, bottomLeft, confidence, method:'paper-luma' }
}

function edgeScore(data, width, x, y) {
  const left = (y * width + Math.max(0, x - 2)) * 4
  const right = (y * width + Math.min(width - 1, x + 2)) * 4
  const top = (Math.max(0, y - 2) * width + x) * 4
  const bottom = (Math.min((data.length / 4 / width) - 1, y + 2) * width + x) * 4
  return Math.abs(luminance(data, left) - luminance(data, right)) + Math.abs(luminance(data, top) - luminance(data, bottom))
}

export function detectDocumentBounds(imageData, width, height) {
  if (!imageData?.length || width < 8 || height < 8) return { x: 0, y: 0, width, height, confidence: 0 }
  const step = Math.max(2, Math.floor(Math.min(width, height) / 180))
  const threshold = 62
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let hits = 0

  for (let y = step * 2; y < height - step * 2; y += step) {
    for (let x = step * 2; x < width - step * 2; x += step) {
      if (edgeScore(imageData, width, x, y) < threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      hits += 1
    }
  }

  if (hits < 12 || maxX - minX < width * 0.35 || maxY - minY < height * 0.35) {
    return { x: 0, y: 0, width, height, confidence: 0 }
  }
  const pad = Math.max(4, Math.round(Math.min(width, height) * 0.012))
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const right = Math.min(width, maxX + pad)
  const bottom = Math.min(height, maxY + pad)
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    confidence: Math.min(0.98, hits / ((width / step) * (height / step) * 0.08))
  }
}

function strongestEdgeX(data, width, height, y, from, to) {
  let bestX = from
  let bestScore = 0
  for (let x = Math.max(2, from); x < Math.min(width - 2, to); x += 2) {
    const score = edgeScore(data, width, x, Math.max(2, Math.min(height - 3, y)))
    if (score > bestScore) {
      bestScore = score
      bestX = x
    }
  }
  return { x: bestX, score: bestScore }
}

function averageBoundary(data, width, height, yStart, yEnd, side) {
  const points = []
  const step = Math.max(2, Math.floor((yEnd - yStart) / 14))
  for (let y = yStart; y <= yEnd; y += step) {
    const edge = side === 'left'
      ? strongestEdgeX(data, width, height, y, 0, Math.floor(width * 0.48))
      : strongestEdgeX(data, width, height, y, Math.floor(width * 0.52), width)
    if (edge.score >= 46) points.push({ x: edge.x, y })
  }
  if (!points.length) return null
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  }
}

export function detectDocumentQuad(imageData, width, height, detectedBounds = null) {
  const bounds = detectedBounds || detectDocumentBounds(imageData, width, height)
  if (!bounds.confidence) {
    return {
      topLeft: { x: 0, y: 0 }, topRight: { x: width - 1, y: 0 },
      bottomRight: { x: width - 1, y: height - 1 }, bottomLeft: { x: 0, y: height - 1 },
      confidence: 0
    }
  }
  const topBandEnd = Math.min(height - 1, bounds.y + bounds.height * 0.22)
  const bottomBandStart = Math.max(0, bounds.y + bounds.height * 0.78)
  const topLeft = averageBoundary(imageData, width, height, bounds.y, topBandEnd, 'left') || { x: bounds.x, y: bounds.y }
  const topRight = averageBoundary(imageData, width, height, bounds.y, topBandEnd, 'right') || { x: bounds.x + bounds.width, y: bounds.y }
  const bottomLeft = averageBoundary(imageData, width, height, bottomBandStart, bounds.y + bounds.height, 'left') || { x: bounds.x, y: bounds.y + bounds.height }
  const bottomRight = averageBoundary(imageData, width, height, bottomBandStart, bounds.y + bounds.height, 'right') || { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
  topLeft.y = bounds.y
  topRight.y = bounds.y
  bottomLeft.y = Math.min(height - 1, bounds.y + bounds.height)
  bottomRight.y = Math.min(height - 1, bounds.y + bounds.height)
  return { topLeft, topRight, bottomRight, bottomLeft, confidence: bounds.confidence }
}

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function fullImageQuad(width, height) {
  return {
    topLeft:{ x:0, y:0 }, topRight:{ x:width - 1, y:0 },
    bottomRight:{ x:width - 1, y:height - 1 }, bottomLeft:{ x:0, y:height - 1 },
    confidence:0
  }
}

export function stabilizeDocumentQuad(quad, width, height) {
  if (!quad || width < 2 || height < 2) return fullImageQuad(width, height)
  const topWidth = pointDistance(quad.topLeft, quad.topRight)
  const bottomWidth = pointDistance(quad.bottomLeft, quad.bottomRight)
  const leftHeight = pointDistance(quad.topLeft, quad.bottomLeft)
  const rightHeight = pointDistance(quad.topRight, quad.bottomRight)
  const naturalWidth = Math.max(topWidth, bottomWidth)
  const naturalHeight = Math.max(leftHeight, rightHeight)
  const estimatedArea = ((topWidth + bottomWidth) / 2) * ((leftHeight + rightHeight) / 2)
  const compactness = Math.min(naturalWidth, naturalHeight) / Math.max(naturalWidth, naturalHeight)
  const paperLuma = quad.method === 'paper-luma'
  const reliable = naturalWidth >= width * (paperLuma ? 0.34 : 0.52)
    && naturalHeight >= height * (paperLuma ? 0.34 : 0.42)
    && estimatedArea >= width * height * (paperLuma ? 0.12 : 0.3)
    && compactness >= (paperLuma ? 0.28 : 0.34)
  return reliable ? quad : fullImageQuad(width, height)
}

export function warpPerspectivePixels(imageData, width, height, quad, maxSize = 960) {
  const naturalWidth = Math.max(pointDistance(quad.topLeft, quad.topRight), pointDistance(quad.bottomLeft, quad.bottomRight))
  const naturalHeight = Math.max(pointDistance(quad.topLeft, quad.bottomLeft), pointDistance(quad.topRight, quad.bottomRight))
  const scale = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight))
  const outputWidth = Math.max(1, Math.round(naturalWidth * scale))
  const outputHeight = Math.max(1, Math.round(naturalHeight * scale))
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)

  for (let y = 0; y < outputHeight; y += 1) {
    const v = outputHeight <= 1 ? 0 : y / (outputHeight - 1)
    const leftX = quad.topLeft.x + (quad.bottomLeft.x - quad.topLeft.x) * v
    const leftY = quad.topLeft.y + (quad.bottomLeft.y - quad.topLeft.y) * v
    const rightX = quad.topRight.x + (quad.bottomRight.x - quad.topRight.x) * v
    const rightY = quad.topRight.y + (quad.bottomRight.y - quad.topRight.y) * v
    for (let x = 0; x < outputWidth; x += 1) {
      const u = outputWidth <= 1 ? 0 : x / (outputWidth - 1)
      const sourceX = Math.max(0, Math.min(width - 1, Math.round(leftX + (rightX - leftX) * u)))
      const sourceY = Math.max(0, Math.min(height - 1, Math.round(leftY + (rightY - leftY) * u)))
      const sourceOffset = (sourceY * width + sourceX) * 4
      const targetOffset = (y * outputWidth + x) * 4
      output[targetOffset] = imageData[sourceOffset]
      output[targetOffset + 1] = imageData[sourceOffset + 1]
      output[targetOffset + 2] = imageData[sourceOffset + 2]
      output[targetOffset + 3] = 255
    }
  }
  return { data: output, width: outputWidth, height: outputHeight }
}

export async function warpPerspectivePixelsAsync(imageData, width, height, quad, maxSize = 960, options = {}) {
  const naturalWidth = Math.max(pointDistance(quad.topLeft, quad.topRight), pointDistance(quad.bottomLeft, quad.bottomRight))
  const naturalHeight = Math.max(pointDistance(quad.topLeft, quad.bottomLeft), pointDistance(quad.topRight, quad.bottomRight))
  const scale = Math.min(1, maxSize / Math.max(naturalWidth, naturalHeight))
  const outputWidth = Math.max(1, Math.round(naturalWidth * scale))
  const outputHeight = Math.max(1, Math.round(naturalHeight * scale))
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  const rowsPerChunk = Math.max(8, options.rowsPerChunk || 48)
  const yieldTask = options.yieldTask || (() => new Promise((resolve) => setTimeout(resolve, 0)))

  for (let chunkStart = 0; chunkStart < outputHeight; chunkStart += rowsPerChunk) {
    const chunkEnd = Math.min(outputHeight, chunkStart + rowsPerChunk)
    for (let y = chunkStart; y < chunkEnd; y += 1) {
      const v = outputHeight <= 1 ? 0 : y / (outputHeight - 1)
      const leftX = quad.topLeft.x + (quad.bottomLeft.x - quad.topLeft.x) * v
      const leftY = quad.topLeft.y + (quad.bottomLeft.y - quad.topLeft.y) * v
      const rightX = quad.topRight.x + (quad.bottomRight.x - quad.topRight.x) * v
      const rightY = quad.topRight.y + (quad.bottomRight.y - quad.topRight.y) * v
      for (let x = 0; x < outputWidth; x += 1) {
        const u = outputWidth <= 1 ? 0 : x / (outputWidth - 1)
        const sourceX = Math.max(0, Math.min(width - 1, Math.round(leftX + (rightX - leftX) * u)))
        const sourceY = Math.max(0, Math.min(height - 1, Math.round(leftY + (rightY - leftY) * u)))
        const sourceOffset = (sourceY * width + sourceX) * 4
        const targetOffset = (y * outputWidth + x) * 4
        output[targetOffset] = imageData[sourceOffset]
        output[targetOffset + 1] = imageData[sourceOffset + 1]
        output[targetOffset + 2] = imageData[sourceOffset + 2]
        output[targetOffset + 3] = 255
      }
    }
    if (chunkEnd < outputHeight) await yieldTask()
  }
  return { data: output, width: outputWidth, height: outputHeight }
}

function cropPixelBuffer(data, width, height, hint) {
  if (!hint) return { data, width, height, crop: { x: 0, y: 0, width, height } }
  const left = Math.max(0, Math.min(width - 1, Math.floor(width * (hint.x ?? 0))))
  const top = Math.max(0, Math.min(height - 1, Math.floor(height * (hint.y ?? 0))))
  const right = Math.max(left + 1, Math.min(width, Math.ceil(width * ((hint.x ?? 0) + (hint.width ?? 1)))))
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil(height * ((hint.y ?? 0) + (hint.height ?? 1)))))
  const croppedWidth = right - left
  const croppedHeight = bottom - top
  const cropped = new Uint8ClampedArray(croppedWidth * croppedHeight * 4)
  for (let y = 0; y < croppedHeight; y += 1) {
    const sourceOffset = ((top + y) * width + left) * 4
    const targetOffset = y * croppedWidth * 4
    cropped.set(data.subarray(sourceOffset, sourceOffset + croppedWidth * 4), targetOffset)
  }
  return { data: cropped, width: croppedWidth, height: croppedHeight, crop: { x: left, y: top, width: croppedWidth, height: croppedHeight } }
}
function darkPixel(data, width, height, x, y, threshold = 170) {
  const safeX = Math.max(0, Math.min(width - 1, x))
  const safeY = Math.max(0, Math.min(height - 1, y))
  return luminance(data, (safeY * width + safeX) * 4) < threshold
}

function regionDarkRatio(data, width, height, left, top, right, bottom, threshold = 150) {
  const x0 = Math.max(0, Math.floor(left))
  const x1 = Math.min(width, Math.ceil(right))
  const y0 = Math.max(0, Math.floor(top))
  const y1 = Math.min(height, Math.ceil(bottom))
  if (x1 <= x0 || y1 <= y0) return 0
  let dark = 0
  let total = 0
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 90))
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      dark += darkPixel(data, width, height, x, y, threshold) ? 1 : 0
      total += 1
    }
  }
  return total ? dark / total : 0
}

function mergeUnderlineSegments(segments, width) {
  const parents = segments.map((_, index) => index)
  const find = (index) => {
    let cursor = index
    while (parents[cursor] !== cursor) {
      parents[cursor] = parents[parents[cursor]]
      cursor = parents[cursor]
    }
    return cursor
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parents[rootB] = rootA
  }
  const maxGap = Math.max(10, width * 0.026)
  for (let index = 0; index < segments.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      const a = segments[index]
      const b = segments[previous]
      const horizontalGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
      if (Math.abs(a.y - b.y) <= 4 && horizontalGap <= maxGap) union(index, previous)
    }
  }
  const groups = new Map()
  segments.forEach((segment, index) => {
    const root = find(index)
    const items = groups.get(root) || []
    items.push(segment)
    groups.set(root, items)
  })
  return [...groups.values()].map((items) => ({
    x: Math.min(...items.map((item) => item.x0)),
    right: Math.max(...items.map((item) => item.x1)),
    y: items.reduce((sum, item) => sum + item.y, 0) / items.length
  }))
}

function labelReturnFormSlots(lines) {
  if (lines.length < 3) return []
  const opinion = [...lines]
    .filter((line) => line.x < 0.34 && line.y >= 0.7 && line.right - line.x > 0.34)
    .sort((a, b) => (b.right - b.x) - (a.right - a.x))[0]
  if (!opinion) return []
  const row = lines.filter((line) => line !== opinion && line.y >= opinion.y + 0.006 && line.y <= opinion.y + 0.11)
  const name = row
    .filter((line) => line.x >= 0.32 && line.x < 0.66 && line.right - line.x >= 0.1)
    .sort((a, b) => Math.abs(a.x - 0.42) - Math.abs(b.x - 0.42) || a.filledRatio - b.filledRatio)[0]
  const signature = row
    .filter((line) => line.x >= 0.62 && line.x < 0.94 && line.right - line.x >= 0.08)
    .sort((a, b) => Math.abs(a.y - (name?.y || opinion.y + 0.045)) - Math.abs(b.y - (name?.y || opinion.y + 0.045)) || Math.abs(a.x - 0.74) - Math.abs(b.x - 0.74))[0]
  if (!name || !signature || Math.abs(name.y - signature.y) > 0.045) {
    return []
  }
  return [
    { ...opinion, label: '家长意见' },
    { ...name, label: '幼儿姓名' },
    { ...signature, label: '家长签字' }
  ]
}

function selectGenericLabeledUnderlines(lines) {
  const candidates = lines
    .filter((line) => {
      const lineWidth = line.right - line.x
      return line.y >= 0.2
        && line.x >= 0.16
        && lineWidth >= 0.12
        && lineWidth <= 0.8
        && line.filledRatio < 0.22
        && line.labelRatio > 0.006
        && line.labelRatio < 0.82
        && line.separatorRatio > 0.004
    })
    .map((line) => ({
      ...line,
      score: line.labelRatio * 18 + line.separatorRatio * 28 + Math.min(0.36, line.right - line.x) * 2 - line.filledRatio * 3
    }))
    .sort((a, b) => b.score - a.score)

  const selected = []
  for (const candidate of candidates) {
    const duplicate = selected.some((line) => Math.abs(line.y - candidate.y) < 0.018 && Math.abs(line.x - candidate.x) < 0.08)
    if (!duplicate) selected.push(candidate)
    if (selected.length >= 8) break
  }
  return selected
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((line, index) => ({ ...line, label: `签字位${index + 1}`, confidence: Math.min(0.88, 0.7 + line.score * 0.12) }))
}

function recoverReturnFormSlots(lines) {
  const lowerLines = lines
    .filter((line) => line.y >= 0.7 && line.right - line.x >= 0.08)
    .sort((a, b) => a.y - b.y || a.x - b.x)
  let best = null
  for (const opinion of lowerLines) {
    const opinionWidth = opinion.right - opinion.x
    if (opinion.x >= 0.34 || opinionWidth < 0.34 || opinion.filledRatio >= 0.4) continue
    const candidates = lowerLines.filter((line) => line !== opinion && line.y >= opinion.y + 0.006 && line.y <= opinion.y + 0.11)
    const names = candidates.filter((line) => line.x >= 0.32 && line.x < 0.66 && line.right - line.x >= 0.1 && line.filledRatio < 0.42)
    const signatures = candidates.filter((line) => line.x >= 0.62 && line.x < 0.94 && line.right - line.x >= 0.08 && line.filledRatio < 0.72)
    for (const name of names) {
      for (const signature of signatures) {
        if (Math.abs(name.y - signature.y) > 0.045 || name.right > signature.x + 0.02) continue
        const labelHints = [opinion, name, signature].filter((line) => line.labelRatio > 0.004).length
        if (labelHints < 2) continue
        const rowAgreement = 1 - Math.min(1, Math.abs(name.y - signature.y) / 0.045)
        const zoneAgreement = 1 - Math.min(1, Math.abs(name.x - 0.42) + Math.abs(signature.x - 0.74))
        const score = labelHints * 12 + opinionWidth * 4 + rowAgreement * 3 + zoneAgreement * 2 - signature.filledRatio
        if (!best || score > best.score) best = { score, lines: [opinion, name, signature] }
      }
    }
  }
  if (!best) return []
  return [
    { ...best.lines[0], label: '家长意见' },
    { ...best.lines[1], label: '幼儿姓名' },
    { ...best.lines[2], label: '家长签字' }
  ]
}

function slotSetScore(slots) {
  if (!slots?.length) return 0
  const expected = ['家长意见', '幼儿姓名', '家长签字']
  const semantic = expected.every((label) => slots.some((slot) => slot.label === label))
  return (semantic ? 100 : 0) + Math.min(3, slots.length) * 8 - Math.max(0, slots.length - 3) * 5
}

function chooseDetectedSlots(warpedSlots, sourceSlots) {
  return slotSetScore(sourceSlots) > slotSetScore(warpedSlots) ? sourceSlots : warpedSlots
}

export function detectSignatureLines(imageData, width, height) {
  if (!imageData?.length || width < 80 || height < 120) return []
  const segments = []
  const minRun = Math.max(22, width * 0.078)
  const maxRun = width * 0.8
  const startX = Math.floor(width * 0.035)
  const endX = Math.floor(width * 0.965)
  const startY = Math.floor(height * 0.2)
  for (let y = startY; y < height - 5; y += 1) {
    let runStart = -1
    for (let x = startX; x <= endX; x += 1) {
      const dark = x < endX && darkPixel(imageData, width, height, x, y, 205)
      if (dark && runStart < 0) runStart = x
      if (!dark && runStart >= 0) {
        const runWidth = x - runStart
        if (runWidth >= minRun && runWidth <= maxRun) {
          const above = regionDarkRatio(imageData, width, height, runStart, y - 4, x, y - 3, 205)
          const below = regionDarkRatio(imageData, width, height, runStart, y + 4, x, y + 5, 205)
          if (Math.max(above, below) < 0.55) segments.push({ x0: runStart, x1: x, y })
        }
        runStart = -1
      }
    }
  }

  const measuredLines = mergeUnderlineSegments(segments, width)
    .filter((line) => line.right - line.x >= width * 0.12)
    .map((line) => ({
      x: line.x / width,
      right: line.right / width,
      y: line.y / height,
      filledRatio: regionDarkRatio(imageData, width, height, line.x, line.y - height * 0.028, line.right, line.y - 4),
      labelRatio: regionDarkRatio(imageData, width, height, line.x - width * 0.24, line.y - height * 0.026, line.x - 3, line.y + height * 0.012, 190),
      separatorRatio: regionDarkRatio(imageData, width, height, line.x - width * 0.07, line.y - height * 0.03, line.x - 2, line.y + height * 0.012, 205)
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 48)

  const strictLines = measuredLines.filter((line) => line.filledRatio < 0.105 && line.labelRatio > 0.025 && line.labelRatio < 0.75)
  let lines = labelReturnFormSlots(strictLines)
  const strictIsReturnForm = lines.length === 3 && lines.every((line) => ['家长意见', '幼儿姓名', '家长签字'].includes(line.label))
  if (!strictIsReturnForm) {
    const relaxedLines = measuredLines.filter((line) => line.filledRatio < 0.22 && line.labelRatio > 0.006 && line.labelRatio < 0.82)
    const relaxedResult = labelReturnFormSlots(relaxedLines)
    const relaxedIsReturnForm = relaxedResult.length === 3
      && relaxedResult.every((line) => ['家长意见', '幼儿姓名', '家长签字'].includes(line.label))
      && relaxedLines.filter((line) => line.labelRatio > 0.012).length >= 2
    if (relaxedIsReturnForm) lines = relaxedResult
  }
  if (!(lines.length === 3 && lines.every((line) => ['家长意见', '幼儿姓名', '家长签字'].includes(line.label)))) {
    const recovered = recoverReturnFormSlots(measuredLines)
    if (recovered.length === 3) lines = recovered
  }
  if (!lines.length) lines = selectGenericLabeledUnderlines(measuredLines)

  return lines.map((line, index) => ({
    id: `scan-slot-${index + 1}`,
    label: line.label,
    x: Math.max(0, line.x),
    y: Math.max(0, line.y - 0.035),
    width: Math.min(0.32, Math.max(0.08, 0.98 - line.x)),
    height: 0.04,
    confidence: line.confidence || 0.86,
    source: 'cv-underline'
  }))
}

function promisify(call) {
  return new Promise((resolve, reject) => call({ success: resolve, fail: reject }))
}

function reportProgress(options, value, label) {
  try {
    options.onProgress?.({ value, label })
  } catch {}
}

async function scanDocumentImageInBrowser(file, options = {}) {
  reportProgress(options, 4, '读取照片')
  const image = await new Promise((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error('无法读取图片像素'))
    element.src = file.path
  })
  const maxDimension = options.maxDimension || 960
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, width, height)
  reportProgress(options, 18, '提取图像')
  const source = context.getImageData(0, 0, width, height)
  const detectSignatures = options.detectSignatures !== false
  const sourceSlots = detectSignatures ? detectSignatureLines(source.data, width, height) : []
  if (options.analysisOnly && options.preferSourceDetection && sourceSlots.length) {
    return { ...file, width, height, detectedSlots:sourceSlots, kind:'image', detectionSpace:'source' }
  }
  const bounds = detectDocumentBounds(source.data, width, height)
  const paperQuad = detectPaperQuad(source.data, width, height)
  const quad = stabilizeDocumentQuad(paperQuad.confidence ? paperQuad : detectDocumentQuad(source.data, width, height, bounds), width, height)
  reportProgress(options, 46, '识别边沿')
  const warped = options.yieldToUi
    ? await warpPerspectivePixelsAsync(source.data, width, height, quad, maxDimension, options)
    : warpPerspectivePixels(source.data, width, height, quad, maxDimension)
  reportProgress(options, 74, '透视裁切')
  const warpedSlots = detectSignatures ? detectSignatureLines(warped.data, warped.width, warped.height) : []
  const detectedSlots = options.preferSourceDetection && sourceSlots.length
    ? sourceSlots
    : chooseDetectedSlots(warpedSlots, sourceSlots)
  const useSourceSlots = detectedSlots === sourceSlots && sourceSlots.length > 0
  const analysis = {
    ...file,
    width: useSourceSlots ? width : warped.width,
    height: useSourceSlots ? height : warped.height,
    scanBounds: bounds,
    scanQuad: quad,
    detectedSlots,
    kind: 'image',
    detectionSpace: useSourceSlots ? 'source' : 'warped'
  }

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = warped.width
  outputCanvas.height = warped.height
  outputCanvas.getContext('2d').putImageData(new ImageData(warped.data, warped.width, warped.height), 0, 0)
  reportProgress(options, 88, '保存结果')
  const blob = await new Promise((resolve, reject) => {
    outputCanvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法生成校正图片')), 'image/jpeg', options.quality || 0.9)
  })
  reportProgress(options, 100, '裁切完成')
  return {
    ...analysis,
    path: URL.createObjectURL(blob),
    name: file.name.replace(/\.[^.]+$/, '') + '-扫描.jpg',
    extension: 'jpg'
  }
}

export async function scanDocumentImage(file, options = {}) {
  const uniApi = options.uniApi || globalThis.uni
  const canvasId = options.canvasId || 'scanCanvas'
  const component = options.component
  if (!file?.path) return file
  if (typeof uniApi?.getImageInfo !== 'function') {
    if (typeof document !== 'undefined' && typeof Image !== 'undefined') return scanDocumentImageInBrowser(file, options)
    return file
  }

  reportProgress(options, 4, '读取照片')
  const info = await promisify((callbacks) => uniApi.getImageInfo({ src: file.path, ...callbacks }))
  const maxDimension = options.maxDimension || 960
  const scale = Math.min(1, maxDimension / Math.max(info.width, info.height))
  const width = Math.max(1, Math.round(info.width * scale))
  const height = Math.max(1, Math.round(info.height * scale))
  const ctx = uniApi.createCanvasContext(canvasId, component)
  ctx.drawImage(file.path, 0, 0, width, height)
  await new Promise((resolve) => ctx.draw(false, resolve))
  reportProgress(options, 18, '提取图像')
  const pixels = await promisify((callbacks) => uniApi.canvasGetImageData({ canvasId, x: 0, y: 0, width, height, ...callbacks }, component))
  const cropped = cropPixelBuffer(pixels.data, width, height, options.cropHint)
  const sourceData = cropped.data
  const sourceWidth = cropped.width
  const sourceHeight = cropped.height
  const detectSignatures = options.detectSignatures !== false
  const sourceSlots = detectSignatures ? detectSignatureLines(sourceData, sourceWidth, sourceHeight) : []
  if (options.analysisOnly && options.preferSourceDetection && sourceSlots.length) {
    return { ...file, width:sourceWidth, height:sourceHeight, scanCrop:cropped.crop, detectedSlots:sourceSlots, detectionSpace:'source', kind:'image' }
  }
  const bounds = detectDocumentBounds(sourceData, sourceWidth, sourceHeight)
  const paperQuad = detectPaperQuad(sourceData, sourceWidth, sourceHeight)
  const quad = stabilizeDocumentQuad(paperQuad.confidence ? paperQuad : detectDocumentQuad(sourceData, sourceWidth, sourceHeight, bounds), sourceWidth, sourceHeight)
  reportProgress(options, 46, '识别边沿')
  const warped = options.yieldToUi
    ? await warpPerspectivePixelsAsync(sourceData, sourceWidth, sourceHeight, quad, maxDimension, options)
    : warpPerspectivePixels(sourceData, sourceWidth, sourceHeight, quad, maxDimension)
  reportProgress(options, 74, '透视裁切')
  const warpedSlots = detectSignatures ? detectSignatureLines(warped.data, warped.width, warped.height) : []
  const detectedSlots = options.preferSourceDetection && sourceSlots.length
    ? sourceSlots
    : chooseDetectedSlots(warpedSlots, sourceSlots)
  const useSourceSlots = detectedSlots === sourceSlots && sourceSlots.length > 0
  await ensureWriteCapacity(Math.ceil(warped.width * warped.height * 0.55), { uniApi })
  reportProgress(options, 84, '保存结果')
  await promisify((callbacks) => uniApi.canvasPutImageData({ canvasId, x: 0, y: 0, width: warped.width, height: warped.height, data: warped.data, ...callbacks }, component))
  const output = await promisify((callbacks) => uniApi.canvasToTempFilePath({
    canvasId,
    x: 0,
    y: 0,
    width: warped.width,
    height: warped.height,
    destWidth: warped.width,
    destHeight: warped.height,
    fileType: 'jpg',
    quality: options.quality || 0.9,
    ...callbacks
  }, component))
  reportProgress(options, 100, '裁切完成')
  return { ...file, path: output.tempFilePath, name: file.name.replace(/\.[^.]+$/, '') + '-扫描.jpg', width: useSourceSlots ? sourceWidth : warped.width, height: useSourceSlots ? sourceHeight : warped.height, scanBounds: bounds, scanQuad: quad, scanCrop: cropped.crop, detectedSlots, detectionSpace: useSourceSlots ? 'source' : 'warped', kind: 'image', extension: 'jpg' }
}

export async function analyzeDocumentImage(file, options = {}) {
  const analyzed = await scanDocumentImage(file, { ...options, analysisOnly: true, preferSourceDetection: true })
  if (options.correctPerspective) return analyzed
  return { ...file, previewPath: file.path, correctedPreviewPath: analyzed.path !== file.path ? analyzed.path : '', width: analyzed.width, height: analyzed.height, detectedSlots: analyzed.detectedSlots, scanBounds: analyzed.scanBounds, scanQuad: analyzed.scanQuad }
}
