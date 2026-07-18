import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { analyzeDocumentImage, detectDocumentBounds, detectPaperQuad, detectSignatureLines, scanDocumentImage, stabilizeDocumentQuad, warpPerspectivePixels, warpPerspectivePixelsAsync } from '../../src/core/vision/documentScanner'

function image(width, height, color = 230) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color; data[index + 1] = color; data[index + 2] = color; data[index + 3] = 255
  }
  return data
}

function line(data, width, y, from, to, color = 30) {
  for (let x = from; x <= to; x += 1) {
    const offset = (y * width + x) * 4
    data[offset] = color; data[offset + 1] = color; data[offset + 2] = color
  }
}

function block(data, width, fromX, fromY, toX, toY, color = 30) {
  for (let y = fromY; y <= toY; y += 1) line(data, width, y, fromX, toX, color)
}

function labeledUnderline(data, width, y, lineStart, lineEnd, labelStart) {
  for (let index = 0; index < 5; index += 1) {
    const x = labelStart + index * 14
    block(data, width, x, y - 19, x + 7, y - 6)
  }
  block(data, width, lineStart - 16, y - 17, lineStart - 13, y - 14)
  block(data, width, lineStart - 16, y - 9, lineStart - 13, y - 6)
  line(data, width, y, lineStart, lineEnd)
}

function resizeToHeight(source, targetHeight) {
  const width = Math.round(source.width * targetHeight / source.height)
  const data = new Uint8ClampedArray(width * targetHeight * 4)
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(x * source.width / width)
      const sourceY = Math.floor(y * source.height / targetHeight)
      const from = (sourceY * source.width + sourceX) * 4
      const to = (y * width + x) * 4
      data[to] = source.data[from]
      data[to + 1] = source.data[from + 1]
      data[to + 2] = source.data[from + 2]
      data[to + 3] = 255
    }
  }
  return { data, width, height:targetHeight }
}

describe('document scanner', () => {
  it('returns the full image when a reliable paper edge is unavailable', () => {
    expect(detectDocumentBounds(image(80, 100), 80, 100)).toMatchObject({ x: 0, y: 0, width: 80, height: 100, confidence: 0 })
  })

  it('falls back to the full photo when edge detection creates an implausibly narrow page', () => {
    const result = stabilizeDocumentQuad({
      topLeft:{ x:610, y:20 }, topRight:{ x:790, y:20 },
      bottomRight:{ x:794, y:880 }, bottomLeft:{ x:608, y:880 },
      confidence:.9
    }, 800, 900)
    expect(result.confidence).toBe(0)
    expect(result.topLeft).toEqual({ x:0, y:0 })
    expect(result.bottomRight).toEqual({ x:799, y:899 })
  })

  it('finds an A4-like bright page on a dark photographed background', () => {
    const width = 320
    const height = 480
    const data = image(width, height, 42)
    for (let y = 54; y <= 430; y += 1) {
      const progress = (y - 54) / (430 - 54)
      const left = Math.round(70 + (40 - 70) * progress)
      const right = Math.round(250 + (280 - 250) * progress)
      line(data, width, y, left, right, 242)
    }
    for (let y = 105; y < 390; y += 28) line(data, width, y, 92, 228, 65)

    const quad = detectPaperQuad(data, width, height)
    expect(quad.confidence).toBeGreaterThan(0.6)
    expect(quad.method).toBe('paper-luma')
    expect(quad.topLeft.x).toBeGreaterThanOrEqual(60)
    expect(quad.topLeft.x).toBeLessThanOrEqual(82)
    expect(quad.topLeft.y).toBeGreaterThanOrEqual(48)
    expect(quad.topRight.x).toBeGreaterThanOrEqual(238)
    expect(quad.bottomLeft.x).toBeLessThanOrEqual(52)
    expect(quad.bottomRight.x).toBeGreaterThanOrEqual(268)
    expect(stabilizeDocumentQuad(quad, width, height).confidence).toBeGreaterThan(0)
  })

  it('does not crop a uniformly bright photo without a distinct paper region', () => {
    expect(detectPaperQuad(image(160, 220, 245), 160, 220).confidence).toBe(0)
  })

  it('detects three labeled underlines and ignores a line that is already filled', () => {
    const width = 400; const height = 600; const data = image(width, height, 250)
    block(data, width, 20, 492, 68, 504)
    line(data, width, 500, 80, 345)
    block(data, width, 105, 542, 160, 554)
    line(data, width, 550, 170, 260)
    block(data, width, 265, 542, 278, 554)
    line(data, width, 550, 285, 372)
    block(data, width, 8, 542, 45, 554)
    line(data, width, 550, 50, 100)
    block(data, width, 52, 530, 96, 544)
    const slots = detectSignatureLines(data, width, height)
    expect(slots).toHaveLength(3)
    expect(slots.map((slot) => slot.label)).toEqual(['家长意见', '幼儿姓名', '家长签字'])
    expect(slots.every((slot) => slot.source === 'cv-underline')).toBe(true)
  })

  it('recognizes all three semantic slots in at least 99% of provided-image perturbations within the pixel budget', () => {
    const fixture = PNG.sync.read(fs.readFileSync(new URL('../fixtures/return-form-user.png', import.meta.url)))
    const base = resizeToHeight(fixture, 640)
    const startedAt = performance.now()
    const baseline = detectSignatureLines(base.data, base.width, base.height)
    expect(performance.now() - startedAt).toBeLessThan(3000)
    expect(baseline.map((slot) => slot.label)).toEqual(['家长意见', '幼儿姓名', '家长签字'])
    expect(baseline.every((slot) => slot.width <= 0.32)).toBe(true)
    expect(baseline[0].width).toBeCloseTo(0.32, 5)

    let seed = 17
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    let successful = 0
    for (let sample = 0; sample < 100; sample += 1) {
      const brightness = Math.round((random() - .5) * 36)
      const noise = 4 + random() * 12
      const dx = Math.round((random() - .5) * 6)
      const dy = Math.round((random() - .5) * 6)
      const data = new Uint8ClampedArray(base.data.length)
      for (let y = 0; y < base.height; y += 1) {
        for (let x = 0; x < base.width; x += 1) {
          const sourceX = Math.max(0, Math.min(base.width - 1, x - dx))
          const sourceY = Math.max(0, Math.min(base.height - 1, y - dy))
          const from = (sourceY * base.width + sourceX) * 4
          const to = (y * base.width + x) * 4
          for (let channel = 0; channel < 3; channel += 1) {
            data[to + channel] = Math.max(0, Math.min(255, base.data[from + channel] + brightness + (random() - .5) * noise))
          }
          data[to + 3] = 255
        }
      }
      const slots = detectSignatureLines(data, base.width, base.height)
      const semantic = slots.map((slot) => slot.label).join(',') === '家长意见,幼儿姓名,家长签字'
      const accurate = semantic
        && Math.abs(slots[0].x - .157) < .05
        && Math.abs(slots[0].y - .837) < .025
        && Math.abs(slots[1].x - .418) < .05
        && Math.abs(slots[1].y - .874) < .025
        && Math.abs(slots[2].x - .745) < .06
        && Math.abs(slots[2].y - .87) < .025
      if (accurate) successful += 1
    }
    expect(successful).toBeGreaterThanOrEqual(99)
  })

  it('detects generic text-label colon underline fields outside the return-form layout', () => {
    const width = 500; const height = 700; const data = image(width, height, 250)
    labeledUnderline(data, width, 220, 180, 355, 84)
    labeledUnderline(data, width, 350, 250, 430, 154)
    labeledUnderline(data, width, 500, 100, 280, 20)

    const slots = detectSignatureLines(data, width, height)
    expect(slots.map((slot) => slot.label)).toEqual(['签字位1', '签字位2', '签字位3'])
    expect(slots.map((slot) => slot.x)).toEqual([0.36, 0.5, 0.2])
    expect(slots.every((slot) => slot.width <= 0.32)).toBe(true)
  })

  it('does not treat unlabeled picture borders as signature positions', () => {
    const width = 400; const height = 600; const data = image(width, height, 240)
    line(data, width, 400, 40, 180)
    line(data, width, 460, 220, 360)
    line(data, width, 540, 30, 370)
    expect(detectSignatureLines(data, width, height)).toEqual([])
  })

  it('uses relaxed label evidence for compressed return-form images', () => {
    const width = 400; const height = 600; const data = image(width, height, 250)
    block(data, width, 54, 494, 58, 497)
    line(data, width, 500, 80, 345)
    block(data, width, 132, 544, 136, 547)
    line(data, width, 550, 170, 260)
    block(data, width, 268, 544, 272, 547)
    line(data, width, 550, 285, 372)
    block(data, width, 20, 544, 24, 547)
    line(data, width, 550, 50, 100)

    const slots = detectSignatureLines(data, width, height)
    expect(slots.map((slot) => slot.label)).toEqual(['家长意见', '幼儿姓名', '家长签字'])
  })

  it('returns source-space slots without perspective rendering on the analysis fast path', async () => {
    const width = 400; const height = 600; const data = image(width, height, 250)
    block(data, width, 20, 492, 68, 504)
    line(data, width, 500, 80, 345)
    block(data, width, 105, 542, 160, 554)
    line(data, width, 550, 170, 260)
    block(data, width, 265, 542, 278, 554)
    line(data, width, 550, 285, 372)
    const context = { drawImage() {}, draw(_reserve, callback) { callback() } }
    let putCalled = false
    let exportCalled = false
    const uniApi = {
      getImageInfo({ success }) { success({ width, height }) },
      createCanvasContext() { return context },
      canvasGetImageData({ success }) { success({ data }) },
      canvasPutImageData({ success }) { putCalled = true; success() },
      canvasToTempFilePath({ success }) { exportCalled = true; success({ tempFilePath: '/generated-preview.jpg' }) }
    }

    const result = await analyzeDocumentImage({ name: 'form.jpg', path: '/form.jpg', kind: 'image', extension: 'jpg' }, { uniApi })
    expect(result.path).toBe('/form.jpg')
    expect(result.previewPath).toBe('/form.jpg')
    expect(result.correctedPreviewPath).toBe('')
    expect(result.detectedSlots.map((slot) => slot.label)).toEqual(['家长意见', '幼儿姓名', '家长签字'])
    expect(putCalled).toBe(false)
    expect(exportCalled).toBe(false)
  })

  it('warps a four-corner document into a rectangular pixel buffer', () => {
    const width = 20; const height = 20; const data = image(width, height)
    const result = warpPerspectivePixels(data, width, height, {
      topLeft: { x: 3, y: 2 }, topRight: { x: 17, y: 4 },
      bottomRight: { x: 16, y: 18 }, bottomLeft: { x: 1, y: 16 }
    }, 100)
    expect(result.width).toBeGreaterThan(10)
    expect(result.height).toBeGreaterThan(10)
    expect(result.data).toHaveLength(result.width * result.height * 4)
  })

  it('yields between perspective chunks while preserving the warped output', async () => {
    const width = 80; const height = 120; const data = image(width, height)
    const quad = {
      topLeft: { x: 5, y: 3 }, topRight: { x: 74, y: 7 },
      bottomRight: { x: 70, y: 116 }, bottomLeft: { x: 2, y: 112 }
    }
    let yields = 0
    const expected = warpPerspectivePixels(data, width, height, quad, 120)
    const result = await warpPerspectivePixelsAsync(data, width, height, quad, 120, {
      rowsPerChunk:16,
      yieldTask:async () => { yields += 1 }
    })

    expect(yields).toBeGreaterThan(1)
    expect(result.width).toBe(expected.width)
    expect(result.height).toBe(expected.height)
    expect(result.data).toEqual(expected.data)
  })

  it('uses the preview only for detection and exports the perspective crop at source resolution', async () => {
    const sourceWidth = 160
    const sourceHeight = 220
    const previewWidth = 73
    const previewHeight = 100
    const resizeCalls = []
    const exportOptions = []
    let readCount = 0
    const context = { drawImage() {}, draw(_reserve, callback) { callback() } }
    const uniApi = {
      getImageInfo({ success }) { success({ width:sourceWidth, height:sourceHeight }) },
      createCanvasContext() { return context },
      canvasGetImageData({ success }) {
        readCount += 1
        success({ data:readCount === 1 ? image(previewWidth, previewHeight, 245) : image(sourceWidth, sourceHeight, 245) })
      },
      canvasPutImageData({ success }) { success() },
      canvasToTempFilePath(options) {
        exportOptions.push(options)
        options.success({ tempFilePath:'/full-resolution-scan.jpg' })
      },
      getStorageInfoSync() { return { currentSize:0, limitSize:10240 } }
    }

    const result = await scanDocumentImage({ name:'letter.jpg', path:'/letter.jpg', kind:'image' }, {
      uniApi,
      maxDimension:100,
      preserveResolution:true,
      detectSignatures:false,
      resizeCanvas:async (width, height) => resizeCalls.push({ width, height })
    })

    expect(readCount).toBe(2)
    expect(result.path).toBe('/full-resolution-scan.jpg')
    expect(result.width).toBeGreaterThan(150)
    expect(result.height).toBeGreaterThan(210)
    expect(exportOptions[0].destWidth).toBe(result.width)
    expect(exportOptions[0].destHeight).toBe(result.height)
    expect(resizeCalls).toEqual([
      { width:previewWidth, height:previewHeight },
      { width:sourceWidth, height:sourceHeight },
      { width:result.width, height:result.height }
    ])
  })
})
