import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, createHmac } from 'node:crypto'
import { expect, test } from '@playwright/test'

const returnForm = path.resolve('tests/fixtures/return-form-three-slots.jpg')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key, value) {
  return createHmac('sha256', key).update(value).digest('hex')
}

function stampEvidenceJpeg(source, manifest) {
  const payload = Buffer.from(`SMV2:${Buffer.from(JSON.stringify(manifest)).toString('base64')}`)
  const segment = Buffer.alloc(payload.length + 4)
  segment[0] = 0xff
  segment[1] = 0xef
  segment.writeUInt16BE(payload.length + 2, 2)
  payload.copy(segment, 4)
  return Buffer.concat([source.subarray(0, 2), segment, source.subarray(2)])
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('completes the real signing workflow and persists one file, template and signature', async ({ page }, testInfo) => {
  const errors = collectRuntimeErrors(page)
  await expect(page.locator('.hero-title')).toHaveText('签字大师')
  await expect(page.locator('.hero-subtitle')).toContainText('signMaster')
  await expect(page.locator('.empty-primary')).toHaveText('点击下方“签署”开始')
  await expect(page.locator('.home-empty')).toHaveClass(/guided/)
  await page.locator('.center-action').click()

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(returnForm)

  await expect(page.locator('.recognize-layout')).toBeVisible({ timeout: 7000 })
  await expect(page.locator('.slot-highlight')).toHaveCount(3)
  await expect(page.locator('.document-image')).toBeVisible()
  await captureVisual(page, testInfo, 'real-document-slots')
  await page.locator('.slot-highlight').filter({ hasText: '家长意见' }).click()

  await expect(page.locator('.draw-page')).toBeVisible()
  await page.setViewportSize({ width: 844, height: 390 })
  await page.locator('.icon-tool').filter({ hasText: '颜色' }).click()
  await expect(page.locator('.palette-panel')).toBeVisible()
  await expect(page.locator('#signatureCanvas')).toHaveCSS('visibility', 'hidden')
  await page.locator('.icon-tool').filter({ hasText: '颜色' }).click()
  await expect(page.locator('.canvas-back')).toHaveCount(0)
  await page.locator('.icon-tool').filter({ hasText: '粗细' }).click()
  await expect(page.locator('.width-panel')).toBeVisible()
  const sliderBox = await page.locator('.width-slider').boundingBox()
  expect(sliderBox.width).toBeGreaterThan(sliderBox.height * 2)
  await page.locator('.icon-tool').filter({ hasText: '粗细' }).click()

  const canvas = page.locator('#signatureCanvas')
  const canvasBox = await canvas.boundingBox()
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.18, canvasBox.y + canvasBox.height * 0.55)
  await page.mouse.down()
  for (let index = 0; index < 18; index += 1) {
    await page.mouse.move(
      canvasBox.x + canvasBox.width * (0.18 + index * 0.03),
      canvasBox.y + canvasBox.height * (0.55 + Math.sin(index * 0.8) * 0.12)
    )
  }
  await page.mouse.up()
  await expect(page.locator('.small-tool').nth(0)).toBeEnabled()
  await page.locator('.small-tool').nth(0).click()
  await expect(page.locator('.small-tool').nth(1)).toBeEnabled()
  await page.locator('.small-tool').nth(1).click()
  await captureVisual(page, testInfo, 'landscape-signature')
  await page.locator('.complete-btn').click()

  await page.setViewportSize({ width: 390, height: 760 })
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.locator('.sig-layer')).toHaveCount(1)
  await expect(page.locator('.signature-layer-image')).toBeVisible()
  const opacityBox = await page.locator('.opacity-control').boundingBox()
  const signatureLibraryBox = await page.locator('.signature-library').boundingBox()
  const finishBox = await page.locator('.finish-button').boundingBox()
  expect(signatureLibraryBox.width).toBeGreaterThanOrEqual(72)
  expect(finishBox.width).toBeGreaterThanOrEqual(108)
  expect(opacityBox.width).toBeGreaterThan(signatureLibraryBox.width)
  const documentBox = await page.locator('.document-surface').boundingBox()
  const signatureBox = await page.locator('.sig-layer').boundingBox()
  expect(signatureBox.x).toBeGreaterThanOrEqual(documentBox.x - 1)
  expect(signatureBox.y).toBeGreaterThanOrEqual(documentBox.y - 1)
  expect(signatureBox.x + signatureBox.width).toBeLessThanOrEqual(documentBox.x + documentBox.width + 1)
  expect(signatureBox.y + signatureBox.height).toBeLessThanOrEqual(documentBox.y + documentBox.height + 1)
  await page.locator('.icon-tool').filter({ hasText: '旋转' }).click()
  await expect(page.locator('.sig-layer')).toHaveAttribute('style', /rotate\(-15deg\)/)
  await page.locator('.icon-tool').filter({ hasText: '撤销' }).click()
  await expect(page.locator('.sig-layer')).toHaveAttribute('style', /rotate\(0deg\)/)
  await captureVisual(page, testInfo, 'bounded-signature-editor')
  await page.locator('.finish-button').click()

  await expect(page.locator('.finish-title')).toHaveText('签署完成')
  await expect(page.locator('.format-btn')).toHaveCount(3)
  await expect(page.locator('.format-btn')).toHaveText(['JPEG', 'PDF', 'PNG'])
  await expect(page.locator('.format-btn').nth(0)).toHaveClass(/active/)
  await expect(page.locator('.format-btn').nth(1)).not.toHaveClass(/active/)
  await expect(page.locator('.share-btn')).toHaveText('分享好友')
  await expect(page.locator('.preview-sign-image')).toBeVisible()
  const actionBox = await page.locator('.action-list').boundingBox()
  const previewBox = await page.locator('.preview-main').boundingBox()
  const exportBox = await page.locator('.export-panel').boundingBox()
  expect(actionBox.y).toBeGreaterThanOrEqual(previewBox.y + previewBox.height - 1)
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(exportBox.y + 1)
  await page.locator('.action-row').filter({ hasText: '保存模板' }).click()
  await expect(page.locator('.template-save-page')).toBeVisible()
  await expect(page.locator('.position-row')).toHaveCount(1)
  await expect(page.locator('.page-title')).toHaveCount(0)
  await expect(page.locator('.slot-marker')).toHaveCount(1)
  await page.locator('.position-row').first().click()
  await expect(page.locator('.position-row.selected')).toHaveCount(1)
  await expect(page.locator('.slot-marker').first()).toHaveClass(/active/)
  expect((await page.locator('.save-template-button').boundingBox()).height).toBeGreaterThanOrEqual(54)
  await page.locator('.binding-status.ready').click()
  await expect(page.locator('.signature-dialog')).toBeVisible()
  await page.locator('.signature-name-input input').fill('家长签字')
  await expect(page.locator('.signature-dialog')).toBeVisible()
  await page.locator('.signature-dialog-confirm').click()
  await page.locator('.template-name-input input').fill('家长回执模板')
  await page.locator('.save-template-button').click({ noWaitAfter: true })
  await expect(page.getByText(/模板.*及关联签名已保存/)).toBeVisible()
  const savedSignatureAction = page.locator('.action-row').filter({ hasText: '签名已保存' })
  await expect(savedSignatureAction).toHaveAttribute('disabled', 'true')
  await expect(savedSignatureAction).toHaveClass(/saved/)
  await captureVisual(page, testInfo, 'export-formats')

  await page.locator('.format-btn').nth(1).click()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.primary-btn').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/_已签署_\d{8}-\d{6}\.pdf$/)
  expect((download.suggestedFilename().match(/\./g) || []).length).toBe(1)
  await download.saveAs(path.resolve('test-results/signmaster-e2e.pdf'))
  await expect(page.getByText(/导出完成/)).toBeVisible()
  await expect(page.locator('.home-button')).toBeVisible()
  await captureVisual(page, testInfo, 'export-complete-actions')
  await page.locator('.home-button').click()

  await expect(page.locator('.file-card')).toHaveCount(1)
  const compactHistory = await page.evaluate(() => {
    const files = JSON.parse(localStorage.getItem('sign-master:files') || '[]')
    const record = files[0] || {}
    return {
      hasEmbeddedProject: Boolean(record.project),
      hasThumbnail: Boolean(record.thumbnail),
      thumbnail: record.thumbnail || '',
      hasDetachedProject: Boolean(record.projectRef && localStorage.getItem(`sign-master:file-project:${record.projectRef}`))
    }
  })
  expect(compactHistory.hasEmbeddedProject).toBe(false)
  expect(compactHistory.hasDetachedProject).toBe(true)
  expect(compactHistory.hasThumbnail).toBe(true)
  const signedFileBox = await page.locator('.file-card').boundingBox()
  await page.reload()
  await expect(page.locator('.file-card')).toHaveCount(1)
  await page.locator('.nav-btn').filter({ hasText: '模板' }).click()
  await expect(page.locator('.template-card')).toHaveCount(1)
  await expect(page.locator('.template-card .template-image')).toHaveCount(0)
  await expect(page.locator('.template-card .template-paper')).toBeVisible()
  const templateBox = await page.locator('.template-card').boundingBox()
  expect(Math.abs(templateBox.height - signedFileBox.height)).toBeLessThanOrEqual(1)
  const templateMarkerBox = await page.locator('.template-card .slot-marker').boundingBox()
  const templateBodyBox = await page.locator('.template-card .template-body').boundingBox()
  expect(templateMarkerBox.y + templateMarkerBox.height).toBeLessThanOrEqual(templateBodyBox.y + 1)
  await captureVisual(page, testInfo, 'default-template-gallery')
  await page.locator('.nav-btn').filter({ hasText: '签名' }).click()
  await expect(page.locator('.signature-card:not(.add)')).toHaveCount(1)
  await expect(page.locator('.signature-name')).toHaveText('家长签字')
  await page.locator('.signature-card:not(.add) .signature-preview').click()
  await expect(page.locator('.preview-dialog')).toBeVisible()
  await page.locator('.preview-close').click()
  await page.locator('.signature-name-button').click()
  await expect(page.getByText('修改名称', { exact:true })).toBeVisible()
  await page.getByText('修改名称', { exact:true }).click()
  await expect(page.getByRole('textbox')).toBeVisible()
  await page.locator('#u-a-m').getByText(/取消|Cancel/, { exact:true }).click()
  const savedWidth = await page.locator('.signature-card:not(.add)').evaluate((element) => element.getBoundingClientRect().width)
  const addWidth = await page.locator('.signature-card.add').evaluate((element) => element.getBoundingClientRect().width)
  expect(Math.abs(savedWidth - addWidth)).toBeLessThanOrEqual(1)

  await page.locator('.nav-btn').filter({ hasText: '文件' }).click()
  await page.locator('.center-action').click()
  const secondChooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText: '相册图片' }).click()
  const secondChooser = await secondChooserPromise
  await secondChooser.setFiles(returnForm)
  await expect(page.locator('.recognize-layout')).toBeVisible({ timeout: 7000 })
  await page.locator('.slot-highlight').filter({ hasText: '幼儿姓名' }).click()
  await expect(page.getByText('应用已有签名', { exact: true })).toBeVisible()
  await page.getByText('手写签名', { exact: true }).click()
  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.locator('.saved-trigger')).toBeVisible()
  await page.locator('.saved-trigger').click()
  await expect(page.locator('.saved-panel')).toBeVisible()
  await expect(page.locator('.saved-close')).toHaveCount(0)
  const drawPageBox = await page.locator('.draw-page').boundingBox()
  const savedPanelBox = await page.locator('.saved-panel').boundingBox()
  expect(savedPanelBox.width / drawPageBox.width).toBeGreaterThan(0.55)
  expect(savedPanelBox.width / drawPageBox.width).toBeLessThan(0.65)
  await page.locator('.saved-trigger').click()
  await expect(page.locator('.saved-panel')).toHaveCount(0)
  await page.locator('.saved-trigger').click()
  await expect(page.locator('.saved-item')).toContainText('家长签字')
  await page.locator('.saved-item').click()
  await expect(page.locator('.editor')).toBeVisible()
  await expect(page.locator('.sig-layer')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('new library signature uses the full left side and only the native title', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.locator('.nav-btn').filter({ hasText: '签名' }).click()
  await page.locator('.signature-card.add').click()
  await expect(page.locator('.draw-page.library-mode')).toBeVisible()
  await expect(page.locator('.draw-context')).toHaveCount(0)
  await expect(page.locator('.saved-trigger')).toHaveCount(0)
  const canvasBox = await page.locator('.canvas-card').boundingBox()
  expect(canvasBox.x).toBeLessThanOrEqual(20)
})

test('file dashboard is a two-column gallery with deletion and a default-on save setting', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const records = [
      { id: 'file-a', name: '家长回执', path: '/signed-a.pdf', kind: 'pdf', date: '2026/7/10 10:00:00', signatures: 3, project: { document: { id: 'doc-a', name: 'a.pdf', path: '/a.pdf', kind: 'pdf' } } },
      { id: 'file-b', name: '入职合同', path: '/signed-b.pdf', kind: 'pdf', date: '2026/7/10 11:00:00', signatures: 1, project: { document: { id: 'doc-b', name: 'b.pdf', path: '/b.pdf', kind: 'pdf' } } }
    ]
    localStorage.setItem('sign-master:files', JSON.stringify(records))
  })
  await page.reload()
  await expect(page.locator('.file-card')).toHaveCount(2)
  const first = await page.locator('.file-card').nth(0).boundingBox()
  const second = await page.locator('.file-card').nth(1).boundingBox()
  expect(first.height).toBeGreaterThanOrEqual(180)
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1)
  expect(second.x).toBeGreaterThan(first.x + first.width - 1)
  await expect(page.locator('.file-overlay')).toHaveCount(2)
  await captureVisual(page, testInfo, 'two-column-file-gallery')

  await longPress(page, page.locator('.file-wrap').first())
  await expect(page.getByText('删除文件', { exact: true })).toBeVisible()
  await page.getByText(/确定|OK/, { exact: true }).click()
  await expect(page.locator('.file-card')).toHaveCount(1)

  await page.locator('.nav-btn').filter({ hasText: '我的' }).click()
  const saveRow = page.locator('.setting-row').filter({ hasText: '保存签署后的文件' })
  expect(await saveRow.locator('.switch-control').evaluate((element) => element.classList.contains('on'))).toBe(true)
  await saveRow.click()
  await expect(page.getByText('关闭文件保存？', { exact: true })).toBeVisible()
  await page.getByText('确认关闭', { exact: true }).click()
  expect(await saveRow.locator('.switch-control').evaluate((element) => element.classList.contains('on'))).toBe(false)
})

test('template management supports rename and confirmed deletion', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const positions = [{ id: 'slot-1', label: '家长签字', x: 0.6, y: 0.8, width: 0.28, height: 0.08 }]
    localStorage.setItem('sign-master:templates', JSON.stringify([{ id: 'tpl-test', name: '家长回执', slots: 1, positions, createdAt: Date.now() }]))
  })
  await page.reload()
  await page.locator('.nav-btn').filter({ hasText: '模板' }).click()
  await expect(page.locator('.template-card')).toHaveCount(1)
  await captureVisual(page, testInfo, 'template-delete-alignment')
  const cardBox = await page.locator('.template-card').boundingBox()
  const removeBox = await page.locator('.delete-button').boundingBox()
  expect(Math.abs((removeBox.x + removeBox.width / 2) - (cardBox.x + cardBox.width))).toBeLessThanOrEqual(8)
  expect(Math.abs((removeBox.y + removeBox.height / 2) - cardBox.y)).toBeLessThanOrEqual(8)
  await page.locator('.template-card').click()
  await page.getByText('修改名称', { exact: true }).click()
  const modalInput = page.getByRole('textbox')
  await modalInput.fill('暑假回执模板')
  await page.getByText(/确定|OK/, { exact: true }).click()
  await expect(page.getByText('暑假回执模板')).toBeVisible()
  await longPress(page, page.locator('.template-wrap'))
  await expect(page.getByText('删除模板', { exact: true })).toBeVisible()
  await page.getByText(/确定|OK/, { exact: true }).click()
  await expect(page.locator('.template-card')).toHaveCount(0)
})

test('scan page keeps controls usable and returns the corrected real form', async ({ page }, testInfo) => {
  await page.locator('.center-action').click()
  await page.locator('.source-card').filter({ hasText: '扫描文稿' }).click()
  await expect(page.locator('.scan-page')).toBeVisible()
  await expect(page.locator('.camera-actions .capture')).toHaveCount(1)
  await expect(page.locator('.auto-toggle, .cancel, .scan-finish')).toHaveCount(0)

  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.capture').click()
  const chooser = await chooserPromise
  await chooser.setFiles(returnForm)
  await expect(page.locator('.preview-stage')).toBeVisible({ timeout:2000 })
  await expect(page.locator('.page-card')).toHaveCount(1)
  await expect(page.locator('.continue-button')).toBeVisible()
  await expect(page.locator('.continue-button')).toBeEnabled()
  await expect(page.locator('.preview-summary')).toContainText(/后台裁切|裁切已完成/)

  await page.locator('.continue-button').click()
  await expect(page.locator('.camera-actions .capture')).toBeVisible()
  const secondChooserPromise = page.waitForEvent('filechooser')
  await page.locator('.capture').click()
  const secondChooser = await secondChooserPromise
  await secondChooser.setFiles(returnForm)
  await expect(page.locator('.page-card')).toHaveCount(2, { timeout:2000 })
  await expect(page.locator('.drag-handle')).toHaveCount(2)
  await expect(page.locator('.crop-state')).toHaveCount(2)
  await captureVisual(page, testInfo, 'manual-scan-preview')

  await page.locator('.finish-button').click()
  await expect(page.locator('.draw-page')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('手写签名', { exact:true })).toBeVisible()
})

test('applies a saved template directly without reanalyzing the new file', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const points = Array.from({ length: 20 }, (_, index) => ({ x: 80 + index * 12, y: 70 + Math.sin(index / 3) * 20, pressure: .5, t: index * 16 }))
    localStorage.setItem('sign-master:templates', JSON.stringify([{ id:'tpl-direct', name:'直接套用模板', positions:[{ id:'slot-template', label:'家长签字', x:.62, y:.86, width:.28, height:.06, page:1 }], slots:1, createdAt:Date.now() }]))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-direct', name:'我的签名1', label:'我的签名1', isDefault:true, snapshot:{ width:900, height:500, color:'#111111', strokeWidth:4, strokes:[{ color:'#111111', width:4, points }] } }]))
  })
  await page.reload()
  await page.locator('.nav-btn').filter({ hasText:'模板' }).click()
  await page.locator('.template-card').click()
  await page.getByText('应用模板', { exact:true }).click()
  await expect(page.locator('.apply-body')).toBeVisible()
  await page.locator('.document-picker').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByText('相册选择', { exact:true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(returnForm)
  await expect(page.getByText('文件已载入', { exact:true })).toBeVisible()
  await expect(page.locator('.analysis-page')).toHaveCount(0)
  await expect(page.locator('.editor')).toBeVisible()
  await captureVisual(page, testInfo, 'template-one-click-applied')
  await expect(page.locator('.recognize-layout')).toHaveCount(0)
  await expect(page.locator('.sig-layer')).toHaveCount(1)
  await page.locator('.finish-button').click()
  await expect(page.locator('.preview-root')).toBeVisible()
  await expect(page.locator('.action-list')).toHaveCount(0)
})

test('asks whether associated signatures should be kept when deleting a template', async ({ page }) => {
  await page.evaluate(() => {
    const snapshot = { width:330, height:180, color:'#111111', strokeWidth:4, strokes:[{ points:[{ x:20,y:80 },{ x:260,y:90 }] }] }
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-associated', name:'关联签名', label:'关联签名', isDefault:true, snapshot }]))
    localStorage.setItem('sign-master:templates', JSON.stringify([{ id:'tpl-associated', name:'关联模板', positions:[{ id:'slot-1', label:'家长签字', x:.6, y:.82, width:.3, height:.08 }], embeddedSignatures:[{ id:'embedded-1', slotId:'slot-1', name:'关联签名', librarySignatureId:'sig-associated', snapshot }], slots:1 }]))
  })
  await page.reload()
  await page.locator('.nav-btn').filter({ hasText:'模板' }).click()
  await page.locator('.delete-button').click()
  await expect(page.getByText('仅删除模板，保留关联签名', { exact:true })).toBeVisible()
  await expect(page.getByText(/删除模板和 1 个关联签名/, { exact:true })).toBeVisible()
  await page.getByText('仅删除模板，保留关联签名', { exact:true }).click()
  await page.getByText(/确定|OK/, { exact:true }).click()
  await expect(page.locator('.template-card')).toHaveCount(0)
  await page.locator('.nav-btn').filter({ hasText:'签名' }).click()
  await expect(page.locator('.signature-card:not(.add)')).toHaveCount(1)
})

test('verifies local provenance and completes a live handwriting comparison', async ({ page }, testInfo) => {
  await page.evaluate(() => {
    const points = Array.from({ length: 24 }, (_, index) => ({ x:70 + index * 18, y:130 + Math.sin(index / 3) * 36, pressure:.5, t:index * 16 }))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-verify', name:'我的签名1', label:'我的签名1', isDefault:true, snapshot:{ width:844, height:390, color:'#111111', strokeWidth:4, strokes:[{ color:'#111111', width:4, points }] } }]))
  })
  await page.reload()
  await page.locator('.nav-btn').filter({ hasText:'我的' }).click()
  await page.locator('.setting-row').filter({ hasText:'签字鉴别' }).click()
  await expect(page.locator('.verify-page')).toBeVisible()
  await expect(page.locator('.check-value')).toHaveText('来源签章有效')
  await captureVisual(page, testInfo, 'signature-verification')
  await page.locator('.verify-button').click()
  await page.setViewportSize({ width:844, height:390 })
  const canvas = page.locator('#signatureCanvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + 70, box.y + 130)
  await page.mouse.down()
  for (let index = 0; index < 24; index += 1) await page.mouse.move(box.x + 70 + index * 18, box.y + 130 + Math.sin(index / 3) * 36)
  await page.mouse.up()
  await page.locator('.complete-btn').click()
  await page.setViewportSize({ width:390, height:760 })
  await expect(page.locator('.result-card')).toBeVisible()
  await expect(page.locator('.score-ring')).not.toHaveText('0')
})

test('uploads a signed file and reports system origin before current-user ownership', async ({ page }, testInfo) => {
  const identity = { id:'sigpen_user_e2e_evidence', source:'local-file', secret:'e2e-evidence-secret', createdAt:1710000000000 }
  const attestation = {
    version:'SM1',
    ownerHash:sha256(identity.id),
    createdAt:1710000000100,
    signatureHash:sha256('e2e-signature-shape'),
    behaviorHash:sha256('e2e-signature-behavior'),
    nonce:sha256('e2e-nonce').slice(0, 20)
  }
  attestation.mac = hmac(identity.secret, [attestation.version, attestation.ownerHash, attestation.createdAt, attestation.signatureHash, attestation.behaviorHash, attestation.nonce].join('|'))
  const snapshot = {
    width:844,
    height:390,
    color:'#111111',
    strokeWidth:4,
    strokes:[{ color:'#111111', width:4, points:Array.from({ length:24 }, (_, index) => ({ x:70 + index * 18, y:130 + Math.sin(index / 3) * 36, pressure:.5, t:index * 16 })) }],
    attestation
  }
  const source = readFileSync(returnForm)
  const evidence = {
    version:'SMV2',
    product:'signMaster',
    exportedAt:'2026-07-15T03:20:00.000Z',
    fileName:'e2e-signed.jpg',
    format:'jpg',
    documentId:'e2e-document',
    ownerHash:attestation.ownerHash,
    signatures:[{ id:'layer-e2e', label:'家长签字', page:1, bounds:{ x:210, y:438, width:92, height:38 }, attestation }],
    contentDigest:sha256(source)
  }
  const canonical = JSON.stringify({ version:evidence.version, product:evidence.product, exportedAt:evidence.exportedAt, fileName:evidence.fileName, format:evidence.format, documentId:evidence.documentId, ownerHash:evidence.ownerHash, signatures:evidence.signatures, contentDigest:evidence.contentDigest })
  evidence.seal = hmac(sha256('signMaster|offline-file-evidence|v2|2026-07'), canonical)
  const stampedPath = testInfo.outputPath('e2e-signed.jpg')
  writeFileSync(stampedPath, stampEvidenceJpeg(source, evidence))

  await page.evaluate(({ identity, snapshot }) => {
    localStorage.setItem('sign-master:identity', JSON.stringify(identity))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-evidence', name:'我的签名1', label:'我的签名1', isDefault:true, snapshot }]))
  }, { identity, snapshot })
  await page.reload()
  await page.locator('.nav-btn').filter({ hasText:'我的' }).click()
  await page.locator('.setting-row').filter({ hasText:'签字鉴别' }).click()
  await page.locator('.upload-button').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-option').filter({ hasText:'从相册选择图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(stampedPath)

  await expect(page.locator('.report-card')).toBeVisible()
  await expect(page.locator('.stage-row').nth(0)).toContainText('系统来源鉴定')
  await expect(page.locator('.stage-row').nth(0)).toContainText('通过')
  await expect(page.locator('.stage-row').nth(1)).toContainText('当前用户签字归属鉴定')
  await expect(page.locator('.stage-row').nth(1)).toContainText('通过')
  await expect(page.locator('.evidence-row')).toHaveCount(1)
  await expect(page.locator('.evidence-row')).toContainText('家长签字')
  await captureVisual(page, testInfo, 'signed-file-verification-report')
})

test('adds an existing signature at the document long-press position', async ({ page }) => {
  await page.evaluate(() => {
    const points = Array.from({ length: 18 }, (_, index) => ({ x: 40 + index * 15, y: 90 + Math.sin(index / 2) * 20, pressure: .5, t: index * 16 }))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-long-press', name:'现场常用签名', label:'现场常用签名', isDefault:true, snapshot:{ width:330, height:180, color:'#111111', strokeWidth:4, strokes:[{ color:'#111111', width:4, points }] } }]))
    localStorage.setItem('sign-master:active-project', JSON.stringify({
      document:{ id:'long-press-doc', name:'长按测试.jpg', path:'', kind:'image', width:330, height:500, page:1, totalPages:1 },
      slots:[], activeSlotId:'', signature:null, layers:[], selectedLayerId:'', exportFormat:'pdf', appliedTemplateId:''
    }))
  })
  await page.goto('/#/pages/sign/edit')
  await expect(page.locator('.editor')).toBeVisible()
  const surface = page.locator('#documentSurface')
  const box = await surface.boundingBox()
  const clientX = box.x + box.width * .7
  const clientY = box.y + box.height * .62
  await surface.evaluate((element, point) => {
    const touch = new Touch({ identifier: 1, target: element, clientX: point.clientX, clientY: point.clientY })
    element.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }))
  }, { clientX, clientY })
  await page.waitForTimeout(650)
  await surface.evaluate((element, point) => {
    const touch = new Touch({ identifier: 1, target: element, clientX: point.clientX, clientY: point.clientY })
    element.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch], bubbles: true, cancelable: true }))
  }, { clientX, clientY })
  await expect(page.getByText('应用已有签名', { exact:true })).toBeVisible()
  await page.getByText('应用已有签名', { exact:true }).click()
  await page.getByText('现场常用签名', { exact:true }).click()
  await expect(page.locator('.sig-layer')).toHaveCount(1)
  const layer = await page.locator('.sig-layer').boundingBox()
  expect(layer.x + layer.width / 2).toBeGreaterThan(box.x + box.width * .52)
  expect(layer.y + layer.height / 2).toBeGreaterThan(box.y + box.height * .48)
})

test('applies a saved signature from the adjustment-page signature picker', async ({ page }) => {
  await page.evaluate(() => {
    const points = Array.from({ length:18 }, (_, index) => ({ x:40 + index * 15, y:90 + Math.sin(index / 2) * 20, pressure:.5, t:index * 16 }))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-picker', name:'弹框常用签名', label:'弹框常用签名', isDefault:true, snapshot:{ width:330, height:180, color:'#111111', strokeWidth:4, strokes:[{ color:'#111111', width:4, points }] } }]))
    localStorage.setItem('sign-master:active-project', JSON.stringify({
      document:{ id:'picker-doc', name:'弹框测试.jpg', path:'', kind:'image', width:330, height:500, page:1, totalPages:1 },
      slots:[], activeSlotId:'', signature:null, layers:[], selectedLayerId:'', exportFormat:'pdf', appliedTemplateId:''
    }))
  })
  await page.goto('/#/pages/sign/edit')
  await page.locator('.signature-library').click()
  await expect(page.locator('.signature-picker')).toBeVisible()
  await expect(page.locator('.signature-choice img')).toBeVisible()
  await page.locator('.signature-choice').click()
  await expect(page.locator('.signature-picker')).toHaveCount(0)
  await expect(page.locator('.sig-layer')).toHaveCount(1)
})

test('uses the same full page width for capacity management', async ({ page }) => {
  await page.goto('/#/subpackages/settings/capacity')
  await expect(page.locator('.capacity-page')).toBeVisible()
  const pageBox = await page.locator('.capacity-page').boundingBox()
  const usageBox = await page.locator('.usage-band').boundingBox()
  expect(pageBox.x).toBeLessThanOrEqual(1)
  expect(pageBox.width).toBeGreaterThanOrEqual(389)
  expect(usageBox.x).toBeGreaterThanOrEqual(17)
  expect(usageBox.x).toBeLessThanOrEqual(19)
})

test('keeps support content reachable and shows the exact app identity and filing number', async ({ page }) => {
  await page.goto('/#/subpackages/settings/help')
  const feedback = page.locator('.feedback')
  await feedback.scrollIntoViewIfNeeded()
  await expect(feedback).toBeVisible()
  await expect(feedback.locator('.feedback-button')).toContainText('复制反馈内容')
  await expect(feedback.locator('.feedback-button')).toBeVisible()

  await page.goto('/#/subpackages/settings/about')
  await expect(page.locator('.app-logo img')).toHaveAttribute('src', /static\/app-logo\.png/)
  await expect(page.getByText('闽ICP备2026014225号-3X', { exact:true })).toBeVisible()

  await page.goto('/#/pages/settings/index')
  const filing = page.getByText('闽ICP备2026014225号-3X', { exact:true })
  await filing.scrollIntoViewIfNeeded()
  await expect(filing).toBeVisible()
})

test('adds an existing signature by long-pressing the selection document', async ({ page }) => {
  await page.evaluate(() => {
    const points = Array.from({ length: 18 }, (_, index) => ({ x:40 + index * 15, y:90 + Math.sin(index / 2) * 20, pressure:.5, t:index * 16 }))
    localStorage.setItem('sign-master:signatures', JSON.stringify([{ id:'sig-location-press', name:'定位页常用签名', label:'定位页常用签名', isDefault:true, snapshot:{ width:330, height:180, color:'#111111', strokeWidth:4, strokes:[{ color:'#111111', width:4, points }] } }]))
  })
  await page.reload()
  await page.locator('.center-action').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText:'相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(returnForm)
  await expect(page.locator('.recognize-layout')).toBeVisible({ timeout:7000 })
  const document = page.locator('#documentPreview')
  const box = await document.boundingBox()
  const clientX = box.x + box.width * .5
  const clientY = box.y + box.height * .45
  await document.evaluate((element, point) => {
    const touch = new Touch({ identifier:1, target:element, clientX:point.clientX, clientY:point.clientY })
    element.dispatchEvent(new TouchEvent('touchstart', { touches:[touch], targetTouches:[touch], changedTouches:[touch], bubbles:true, cancelable:true }))
  }, { clientX, clientY })
  await page.waitForTimeout(650)
  await document.evaluate((element, point) => {
    const touch = new Touch({ identifier:1, target:element, clientX:point.clientX, clientY:point.clientY })
    element.dispatchEvent(new TouchEvent('touchend', { changedTouches:[touch], bubbles:true, cancelable:true }))
  }, { clientX, clientY })
  await expect(page.getByText('应用已有签名', { exact:true })).toBeVisible()
  await expect(page.getByText('手写签名', { exact:true })).toBeVisible()
  await page.getByText('应用已有签名', { exact:true }).click()
  await page.getByText('定位页常用签名', { exact:true }).click()
  await expect(page.locator('.sig-layer')).toHaveCount(1)
  const project = await page.evaluate(() => JSON.parse(localStorage.getItem('sign-master:active-project')))
  const addedSlot = project.slots.find((slot) => slot.source === 'manual')
  expect(addedSlot.x).toBeGreaterThan(.25)
  expect(addedSlot.x).toBeLessThan(.45)
  expect(addedSlot.y).toBeGreaterThan(.3)
  expect(addedSlot.y).toBeLessThan(.55)
})

test('keeps the document centered after three landscape handwriting rounds', async ({ page }) => {
  await page.locator('.center-action').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('.source-card').filter({ hasText:'相册图片' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(returnForm)
  await expect(page.locator('.slot-highlight')).toHaveCount(3, { timeout:7000 })
  await page.locator('.slot-highlight').first().click()

  for (let round = 0; round < 3; round += 1) {
    await page.setViewportSize({ width:844, height:390 })
    await expect(page.locator('.draw-page')).toBeVisible()
    await drawSimpleSignature(page, round)
    await page.locator('.complete-btn').click()
    await page.setViewportSize({ width:390, height:760 })
    await expect(page.locator('.editor')).toBeVisible()
    await expect(page.locator('.sig-layer')).toHaveCount(round + 1)
    await page.waitForTimeout(420)
    const editor = await page.locator('.editor').boundingBox()
    const document = await page.locator('.document-surface').boundingBox()
    expect(document.width).toBeGreaterThan(100)
    expect(Math.abs((document.x + document.width / 2) - (editor.x + editor.width / 2))).toBeLessThanOrEqual(2)
    expect(document.x).toBeGreaterThanOrEqual(editor.x - 1)
    expect(document.x + document.width).toBeLessThanOrEqual(editor.x + editor.width + 1)
    if (round < 2) await page.locator('.continue-sign').click()
  }
})

test('explains sandbox clearing and exposes complete backup recovery', async ({ page }) => {
  await page.locator('.nav-btn').filter({ hasText:'我的' }).click()
  await page.locator('.setting-row').filter({ hasText:'备份与恢复' }).click()
  await expect(page.locator('.backup-page')).toBeVisible()
  await expect(page.getByText('为什么清理缓存后会丢失？', { exact:true })).toBeVisible()
  await expect(page.locator('.action-button')).toHaveCount(3)
  await expect(page.locator('.action-button.share')).toContainText('发送备份到微信')
})

test('keeps both home entry animations active and removes the settings recommendation row', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const emptyIcon = page.locator('.empty-doc')
  await expect(emptyIcon).toBeVisible()
  await expect(emptyIcon).toHaveCSS('background-color', 'rgb(88, 86, 224)')

  const animations = await page.evaluate(() => ({
    logoHalo: getComputedStyle(document.querySelector('.brand-halo'), '::before').animationName,
    logo: getComputedStyle(document.querySelector('.brand-halo .app-logo')).animationName,
    emptyHalo: getComputedStyle(document.querySelector('.empty-pulse'), '::before').animationName,
    emptyIcon: getComputedStyle(document.querySelector('.empty-doc')).animationName,
    arrow: getComputedStyle(document.querySelector('.guide-arrow')).animationName
  }))
  expect(animations.logoHalo).not.toBe('none')
  expect(animations.logo).not.toBe('none')
  expect(animations.emptyHalo).not.toBe('none')
  expect(animations.emptyIcon).toBe('none')
  expect(animations.arrow).not.toBe('none')
  await expect(page.locator('.guide-arrow')).toBeVisible()

  await page.locator('.nav-btn').last().click()
  await expect(page.locator('.setting-icon.recommend')).toHaveCount(0)
  await expect(page.locator('.promotion-panel')).toHaveCount(0)
  expect(errors).toEqual([])
})

function collectRuntimeErrors(page) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  return errors
}

async function longPress(page, locator) {
  await locator.dispatchEvent('touchstart')
  await page.waitForTimeout(700)
  await locator.dispatchEvent('touchend')
}

async function drawSimpleSignature(page, seed = 0) {
  const canvas = page.locator('#signatureCanvas')
  const box = await canvas.boundingBox()
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * (.48 + seed * .03))
  await page.mouse.down()
  for (let index = 0; index < 14; index += 1) {
    await page.mouse.move(box.x + box.width * (.2 + index * .035), box.y + box.height * (.5 + Math.sin(index + seed) * .1))
  }
  await page.mouse.up()
}

async function captureVisual(page, testInfo, name) {
  const file = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  await testInfo.attach(name, { path: file, contentType: 'image/png' })
}
