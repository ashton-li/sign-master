import path from 'node:path'
import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { detectDocumentQuad, detectPaperQuad, detectSignatureLines, stabilizeDocumentQuad, warpPerspectivePixels } from '../../src/core/vision/documentScanner.js'

test('crops a folded paper sheet away from a reflective laptop and keyboard', async ({ page }) => {
  const decoded = await decodeFixture(page, path.resolve('tests/fixtures/folded-paper-on-laptop.jpg'))
  const quad = stabilizeDocumentQuad(detectPaperQuad(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height)

  expect(quad.method).toBe('paper-canny')
  expect(quad.confidence).toBeGreaterThan(0.8)
  expect(quad.topLeft.x).toBeGreaterThan(decoded.width * 0.2)
  expect(quad.topLeft.x).toBeLessThan(decoded.width * 0.35)
  expect(quad.topRight.x).toBeGreaterThan(decoded.width * 0.7)
  expect(quad.bottomLeft.x).toBeLessThan(decoded.width * 0.2)
  expect(quad.bottomLeft.y).toBeGreaterThan(decoded.height * 0.62)
  expect(quad.bottomRight.y).toBeLessThan(decoded.height * 0.82)

  const cropped = warpPerspectivePixels(decoded.data, decoded.width, decoded.height, quad)
  expect(cropped.width).toBeGreaterThan(decoded.width * 0.55)
  expect(cropped.height).toBeGreaterThan(decoded.height * 0.5)
})

test('crops the full printed letter from a striped bamboo background', async ({ page }) => {
  const decoded = await decodeFixture(page, path.resolve('tests/fixtures/printed-letter-on-bamboo-mat.jpg'))
  const quad = stabilizeDocumentQuad(detectPaperQuad(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height)
  const topWidth = Math.hypot(quad.topRight.x - quad.topLeft.x, quad.topRight.y - quad.topLeft.y)
  const bottomWidth = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, quad.bottomRight.y - quad.bottomLeft.y)

  expect(quad.method).toBe('paper-canny')
  expect(quad.confidence).toBeGreaterThan(0.85)
  expect(Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth)).toBeGreaterThan(0.7)
  expect(quad.topLeft.x).toBeGreaterThan(decoded.width * 0.2)
  expect(quad.bottomLeft.x).toBeLessThan(decoded.width * 0.2)
  expect(quad.bottomRight.x).toBeGreaterThan(decoded.width * 0.7)

  const cropped = warpPerspectivePixels(decoded.data, decoded.width, decoded.height, quad, Number.POSITIVE_INFINITY)
  const sampledBrightness = cropped.data.reduce((sum, value, index) => index % 4 === 3 ? sum : sum + value, 0) / (cropped.width * cropped.height * 3)
  expect(cropped.width).toBeGreaterThan(decoded.width * 0.55)
  expect(cropped.height).toBeGreaterThan(decoded.height * 0.5)
  expect(sampledBrightness).toBeGreaterThan(120)
})

test('detects a photographed printed letter and preserves source resolution for perspective output', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/printed-letter-on-keyboard.jpg')
  const preview = await decodeFixture(page, fixturePath)
  const full = await decodeFixture(page, fixturePath, 0)
  const previewQuad = stabilizeDocumentQuad(detectPaperQuad(preview.data, preview.width, preview.height), preview.width, preview.height)

  expect(previewQuad.method).toBe('paper-canny')
  expect(previewQuad.confidence).toBeGreaterThan(0.85)
  expect(previewQuad.topLeft.x).toBeGreaterThan(preview.width * 0.1)
  expect(previewQuad.topLeft.x).toBeLessThan(preview.width * 0.18)
  expect(previewQuad.topRight.x).toBeGreaterThan(preview.width * 0.72)
  expect(previewQuad.bottomLeft.x).toBeLessThan(preview.width * 0.08)
  expect(previewQuad.bottomRight.x).toBeGreaterThan(preview.width * 0.9)

  const scaleX = full.width / preview.width
  const scaleY = full.height / preview.height
  const scalePoint = (point) => ({ x:point.x * scaleX, y:point.y * scaleY })
  const fullQuad = {
    topLeft:scalePoint(previewQuad.topLeft),
    topRight:scalePoint(previewQuad.topRight),
    bottomRight:scalePoint(previewQuad.bottomRight),
    bottomLeft:scalePoint(previewQuad.bottomLeft)
  }
  const previewCrop = warpPerspectivePixels(preview.data, preview.width, preview.height, previewQuad, Number.POSITIVE_INFINITY)
  const cropped = warpPerspectivePixels(full.data, full.width, full.height, fullQuad, Number.POSITIVE_INFINITY)
  expect(cropped.width).toBeGreaterThan(previewCrop.width * 1.7)
  expect(cropped.height).toBeGreaterThan(previewCrop.height * 1.7)
  expect(cropped.width).toBeGreaterThan(1000)
})

test('keeps photographed-paper detection above 90% across lighting and sensor-noise changes', async ({ page }) => {
  const decoded = await decodeFixture(page, path.resolve('tests/fixtures/printed-letter-on-keyboard.jpg'))
  const baseline = stabilizeDocumentQuad(detectPaperQuad(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height)
  let seed = 20260719
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  let successes = 0
  const startedAt = Date.now()

  for (let sample = 0; sample < 20; sample += 1) {
    const brightness = Math.round((random() - 0.5) * 28)
    const contrast = 0.9 + random() * 0.2
    const noise = 3 + random() * 8
    const data = new Uint8ClampedArray(decoded.data.length)
    for (let offset = 0; offset < data.length; offset += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset + channel] = Math.max(0, Math.min(255, (decoded.data[offset + channel] - 128) * contrast + 128 + brightness + (random() - 0.5) * noise))
      }
      data[offset + 3] = 255
    }
    const detected = stabilizeDocumentQuad(detectPaperQuad(data, decoded.width, decoded.height), decoded.width, decoded.height)
    const points = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
    const meanError = points.reduce((total, key) => total + Math.hypot(
      detected[key].x - baseline[key].x,
      detected[key].y - baseline[key].y
    ), 0) / points.length / Math.hypot(decoded.width, decoded.height)
    if (detected.method === 'paper-canny' && detected.confidence > 0.75 && meanError < 0.035) successes += 1
  }

  expect(successes / 20).toBeGreaterThanOrEqual(0.9)
  expect((Date.now() - startedAt) / 20).toBeLessThan(3000)
})

test('detects the three labeled underline slots in the real return form', async ({ page }) => {
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.goto('/')
  const fixturePath = path.resolve('tests/fixtures/return-form-three-slots.jpg')
  const decoded = await decodeFixture(page, fixturePath)
  const quad = detectDocumentQuad(decoded.data, decoded.width, decoded.height)
  const warped = warpPerspectivePixels(decoded.data, decoded.width, decoded.height, quad)
  expect(detectSignatureLines(warped.data, warped.width, warped.height)).toHaveLength(3)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.center-action').click()

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(fixturePath)

  await expect(page.locator('.analysis-page')).toBeVisible()
  await page.waitForTimeout(3500)
  expect(runtimeErrors).toEqual([])
  await expect(page.locator('.recognize-layout')).toBeVisible()
  await expect(page.locator('.detection-badge')).toHaveText('识别到 3 个签字位')
  await expect(page.locator('.slot-highlight')).toHaveCount(3)
  await expect(page.locator('.slot-highlight')).toHaveText(['家长意见', '幼儿姓名', '家长签字'])
  const slotBoxes = await page.locator('.slot-highlight').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()))
  const documentBox = await page.locator('.document-content').evaluate((item) => item.getBoundingClientRect())
  expect(slotBoxes.every((box) => box.width <= documentBox.width * .321)).toBe(true)
  await expect(page.locator('.zoom-controls')).toHaveCount(0)
  await page.locator('.slot-highlight').first().click()
  await expect(page.locator('.draw-page')).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('allows analysis to be skipped and returns to the same positioning page', async ({ page }) => {
  await page.goto('/')
  const plainImage = path.resolve('doc/html/主页.png')
  const decoded = await decodeFixture(page, plainImage)
  const quad = detectDocumentQuad(decoded.data, decoded.width, decoded.height)
  const warped = warpPerspectivePixels(decoded.data, decoded.width, decoded.height, quad)
  expect(detectSignatureLines(warped.data, warped.width, warped.height)).toEqual([])
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.center-action').click()

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(plainImage)
  await expect(page.locator('.analysis-page')).toBeVisible()
  await page.locator('.skip-analysis').click()
  await expect(page.locator('.draw-page')).toBeVisible()
  await page.goBack()
  await expect(page.locator('.recognize-layout')).toBeVisible()
  await expect(page.locator('.slot-highlight')).toHaveCount(0)
  await expect(page.locator('.detection-badge')).toHaveText('未识别到签字位')
})

test('detects the three slots when the provided document is imported as PNG', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.center-action').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(path.resolve('tests/fixtures/return-form-three-slots.png'))
  await expect(page.locator('.recognize-layout')).toBeVisible({ timeout: 7000 })
  await expect(page.locator('.detection-badge')).toHaveText('识别到 3 个签字位')
  await expect(page.locator('.slot-highlight')).toHaveText(['家长意见', '幼儿姓名', '家长签字'])
  await expect(page.locator('.document-image')).toBeVisible()
})

test('clears the reading state when the WeChat file picker is cancelled', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator('.center-action').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '微信文件' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles([])
  await expect(page.locator('.picker-mask')).toHaveCount(0)
  await expect(page.locator('.source-grid')).toBeVisible()
  await expect(page.getByText('导入失败', { exact:true })).toHaveCount(0)
})

async function decodeFixture(page, fixturePath, maxDimension = 960) {
  const source = `data:image/jpeg;base64,${fs.readFileSync(fixturePath).toString('base64')}`
  const result = await page.evaluate(async ({ src, maxDimension }) => {
    const image = new Image()
    image.src = src
    await image.decode()
    const scale = maxDimension > 0 ? Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight)) : 1
    const width = Math.round(image.naturalWidth * scale)
    const height = Math.round(image.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0, width, height)
    const bytes = context.getImageData(0, 0, width, height).data
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
    }
    return { width, height, base64: btoa(binary) }
  }, { src:source, maxDimension })
  return { width: result.width, height: result.height, data: new Uint8ClampedArray(Buffer.from(result.base64, 'base64')) }
}
