import path from 'node:path'
import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { detectDocumentQuad, detectPaperQuad, detectSignatureLines, stabilizeDocumentQuad, warpPerspectivePixels } from '../../src/core/vision/documentScanner.js'

test('crops a folded paper sheet away from a reflective laptop and keyboard', async ({ page }) => {
  const decoded = await decodeFixture(page, path.resolve('tests/fixtures/folded-paper-on-laptop.jpg'))
  const quad = stabilizeDocumentQuad(detectPaperQuad(decoded.data, decoded.width, decoded.height), decoded.width, decoded.height)

  expect(quad.method).toBe('paper-contrast')
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

async function decodeFixture(page, fixturePath) {
  const source = `data:image/jpeg;base64,${fs.readFileSync(fixturePath).toString('base64')}`
  const result = await page.evaluate(async (src) => {
    const image = new Image()
    image.src = src
    await image.decode()
    const scale = Math.min(1, 960 / Math.max(image.naturalWidth, image.naturalHeight))
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
  }, source)
  return { width: result.width, height: result.height, data: new Uint8ClampedArray(Buffer.from(result.base64, 'base64')) }
}
