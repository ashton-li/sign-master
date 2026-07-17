import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import automator from 'miniprogram-automator'

const cliPath = [
  process.env.WECHAT_DEVTOOLS_CLI,
  'D:\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
  'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat'
].find((path) => path && existsSync(path))
assert.ok(cliPath, '未找到微信开发者工具 CLI，请设置 WECHAT_DEVTOOLS_CLI')
const projectPath = new URL('../../dist/build/mp-weixin/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
const appJson = JSON.parse(readFileSync(new URL('../../dist/build/mp-weixin/app.json', import.meta.url), 'utf8'))
const projectConfig = JSON.parse(readFileSync(new URL('../../dist/build/mp-weixin/project.config.json', import.meta.url), 'utf8'))
const signLocationWxml = new URL('../../dist/build/mp-weixin/pages/sign/index.wxml', import.meta.url)
const signLocationJs = new URL('../../dist/build/mp-weixin/pages/sign/index.js', import.meta.url)
const previewJs = new URL('../../dist/build/mp-weixin/pages/sign/preview.js', import.meta.url)
  const scannerWxml = new URL('../../dist/build/mp-weixin/pages/sign/scan.wxml', import.meta.url)
  const scannerJs = new URL('../../dist/build/mp-weixin/pages/sign/scan.js', import.meta.url)
  const scannerWxss = new URL('../../dist/build/mp-weixin/pages/sign/scan.wxss', import.meta.url)
const templateCardWxml = new URL('../../dist/build/mp-weixin/components/TemplateCard.wxml', import.meta.url)
assert.equal(appJson.lazyCodeLoading, 'requiredComponents', 'WeChat component lazy loading is not enabled')
assert.match(readFileSync(templateCardWxml, 'utf8'), /^<view[^>]+template-card/, 'template card must own its native root so scoped styles apply in WeChat')
assert.match(readFileSync(signLocationWxml, 'utf8'), /skip-analysis-cover[^>]*catchtouchstart/, '跳过识别按钮缺少微信原生触摸事件')
assert.match(readFileSync(signLocationWxml, 'utf8'), /slot-highlight[^>]*catchtouchend[^>]*catchtap/, '识别签字位缺少微信真机触摸和点击事件')
assert.match(readFileSync(signLocationJs, 'utf8'), /应用已有签名.*手写签名/, '识别签字位没有编译已有签名和手写选择')
assert.match(readFileSync(previewJs, 'utf8'), /value:"jpg",label:"JPEG".*value:"pdf",label:"PDF".*value:"png",label:"PNG"/, '图片导出格式顺序不是 JPEG、PDF、PNG')
assert.match(readFileSync(previewJs, 'utf8'), /showShareImageMenu/, 'JPEG/PNG 没有使用微信图片分享接口')
assert.match(readFileSync(previewJs, 'utf8'), /shareFileMessage/, 'PDF 没有保留微信文件分享接口')
for (const route of ['home', 'templates', 'signatures', 'settings']) {
  const pageConfig = JSON.parse(readFileSync(new URL(`../../dist/build/mp-weixin/pages/${route}/index.json`, import.meta.url), 'utf8'))
  const pageLogic = readFileSync(new URL(`../../dist/build/mp-weixin/pages/${route}/index.js`, import.meta.url), 'utf8')
  assert.equal(pageConfig.enableShareAppMessage, true, `${route} 未开启好友分享`)
  assert.equal(pageConfig.enableShareTimeline, true, `${route} 未开启朋友圈分享`)
  assert.match(pageLogic, /onShareAppMessage/, `${route} 页面没有直接注册好友分享生命周期`)
  assert.match(pageLogic, /onShareTimeline/, `${route} 页面没有直接注册朋友圈分享生命周期`)
}
assert.ok(existsSync(new URL('../../dist/build/mp-weixin/static/share-cover.png', import.meta.url)), '生产包缺少宣传分享封面')
const signaturesWxml = readFileSync(new URL('../../dist/build/mp-weixin/pages/signatures/index.wxml', import.meta.url), 'utf8')
const signaturesJs = readFileSync(new URL('../../dist/build/mp-weixin/pages/signatures/index.js', import.meta.url), 'utf8')
assert.match(signaturesWxml, /preview-share/, '签名预览缺少右上角分享按钮')
assert.match(signaturesJs, /showShareImageMenu/, '签名预览没有编译图片分享接口')
const settingsWxml = readFileSync(new URL('../../dist/build/mp-weixin/pages/settings/index.wxml', import.meta.url), 'utf8')
assert.doesNotMatch(settingsWxml, /推荐签字大师|promotion-panel/, '设置页仍包含已删除的推荐分享入口')
  const scannerMarkup = readFileSync(scannerWxml, 'utf8')
  assert.match(scannerMarkup, /<camera[^>]*\/>.*camera-actions[^>]*>.*capture[^>]*catchtap/s, '扫描器没有保留独立手动拍照按钮')
  assert.doesNotMatch(scannerMarkup, /auto-toggle|scan-finish|重拍上一页/, '相机页仍编译了自动扫描或其他旧按钮')
  assert.match(scannerMarkup, /page-thumb[^>]*(?:bindtap|catchtap)/, '扫描预览缩略图缺少点击预览事件')
  assert.match(scannerMarkup, /drag-handle[^>]*catchtouchstart[^>]*catchtouchmove[^>]*catchtouchend/, '扫描预览缺少多页拖动排序事件')
  const scannerLogic = readFileSync(scannerJs, 'utf8')
  assert.match(scannerLogic, /PDF-1\.4/, '扫描页没有内联 JPEG-PDF 生成实现')
  assert.doesNotMatch(scannerLogic, /scanPdf\.js/, '扫描页仍依赖运行时扫描 PDF 模块')
  assert.doesNotMatch(scannerLogic, /core\/export\/imagePdf\.js/, '扫描页仍跨包加载 JPEG-PDF 生成器')
  assert.doesNotMatch(scannerLogic, /pdfFileSaver\.js/, '扫描页仍依赖运行时 PDF 保存模块')
  assert.ok(existsSync(new URL('../../dist/build/mp-weixin/static/support-qrcode.jpg', import.meta.url)), '生产包缺少公众号支持二维码')
  assert.ok(existsSync(new URL('../../dist/build/mp-weixin/static/app-logo.png', import.meta.url)), '生产包缺少真实小程序 Logo')
  assert.match(readFileSync(new URL('../../dist/build/mp-weixin/components/FilingFooter.wxml', import.meta.url), 'utf8'), /闽ICP备2026014225号-3X/, '生产包缺少备案号')
  assert.doesNotMatch(scannerLogic, /exportSignedPdf/, '扫描页仍依赖微信运行时不稳定的通用签署导出器')
  const scannerStyles = readFileSync(scannerWxss, 'utf8')
  assert.match(scannerStyles, /preview-actions button[^}]*width:100%[^}]*margin:0!important/, '扫描底部按钮没有覆盖微信原生默认宽度和外边距')
if (process.env.MP_STATIC_ONLY === '1') {
  console.log(JSON.stringify({ staticChecks:true, scanPdfInline:true, appid:projectConfig.appid }, null, 2))
  process.exit(0)
}
const routes = [
  ['/pages/home/index', '.home-hero'],
  ['/pages/templates/index', '.template-heading'],
  ['/pages/signatures/index', '.signature-grid'],
  ['/pages/settings/index', '.settings-list'],
  ['/pages/sign/index', '.source-grid'],
  ['/pages/sign/scan', 'camera'],
  ['/pages/sign/draw', '.draw-page'],
  ['/pages/sign/edit', '.edit-root'],
  ['/pages/sign/preview', '.preview-root'],
  ['/pages/sign/save-signatures', '.save-page'],
  ['/pages/sign/save-template', '.template-save-page'],
  ['/subpackages/templates/apply', '.app-page'],
  ['/subpackages/settings/help', '.feedback'],
  ['/subpackages/settings/privacy', '.privacy']
  ,['/subpackages/settings/backup', '.backup-page']
  ,['/subpackages/settings/capacity', '.capacity-page']
  ,['/subpackages/settings/about', '.about-page']
  ,['/subpackages/security/verify', '.verify-page']
]

const automationPort = Number(process.env.WECHAT_AUTOMATION_PORT || 0)
const miniProgram = automationPort
  ? await automator.connect({ wsEndpoint: `ws://127.0.0.1:${automationPort}` })
  : await automator.launch({ cliPath, projectPath, timeout: 120000, trustProject: true })
await miniProgram.evaluate(() => {
  const fs = wx.getFileSystemManager()
  try {
    fs.unlinkSync(`${wx.env.USER_DATA_PATH}/sign-master/state/active-project.json`)
  } catch {}
  try { fs.unlinkSync(`${wx.env.USER_DATA_PATH}/sign-master/state/templates.json`) } catch {}
  try { fs.unlinkSync(`${wx.env.USER_DATA_PATH}/sign-master/state/signatures.json`) } catch {}
  wx.setStorageSync('sign-master:templates', [{
    id: 'smoke-template',
    name: '烟测模板',
    positions: [{ id: 'smoke-template-slot', label: '家长签字', x: .58, y: .72, width: .3, height: .08, page: 1 }],
    slots: 1
  }])
  wx.setStorageSync('sign-master:signatures', [{
    id: 'smoke-signature', name: '烟测常用签字', label: '烟测常用签字', isDefault: true,
    snapshot: { width: 330, height: 180, color: '#111111', strokeWidth: 4, strokes: [{ color: '#111111', width: 4, points: [{ x: 30, y: 90 }, { x: 260, y: 95 }] }] }
  }])
  wx.setStorageSync('sign-master:active-project', {
    document: { id: 'smoke-document', name: 'smoke.jpg', path: '/smoke.jpg', kind: 'image', width: 330, height: 500, page: 1, totalPages: 1 },
    slots: [{ id: 'smoke-slot', label: '签字位1', x: 0.3, y: 0.7, width: 0.3, height: 0.08, page: 1 }],
    activeSlotId: 'smoke-slot',
    signature: null,
    layers: [{ id: 'smoke-layer', slotId: 'smoke-slot', label: '签字位1', x: 99, y: 350, width: 99, height: 40, page: 1, opacity: 1, rotation: 0, snapshot: { width: 330, height: 180, color: '#111111', strokeWidth: 4, strokes: [[{ x: 20, y: 90 }, { x: 300, y: 90 }]] } }],
    selectedLayerId: 'smoke-layer',
    exportFormat: 'pdf',
    appliedTemplateId: ''
  })
})
const loaded = []
let customTabBar = null
const tabSelections = []
let encryptedBackup = null
let signaturePickerApplied = false
let report = null
try {
  for (const [route, selector] of routes) {
    const page = await miniProgram.reLaunch(route)
    await page.waitFor(250)
    assert.equal(page.path, route.replace(/^\//, ''))
    assert.ok(await page.$(selector), `${route} missing ${selector}`)
    if (route === '/pages/home/index') {
      customTabBar = await miniProgram.evaluate(() => {
        const pages = getCurrentPages()
        const current = pages[pages.length - 1]
        const tabBar = typeof current?.getTabBar === 'function' ? current.getTabBar() : null
        return { exists: Boolean(tabBar), selected: tabBar?.data?.selected }
      })
      assert.equal(customTabBar.exists, true, 'home missing native custom tab bar instance')
      assert.equal(customTabBar.selected, 0, 'home custom tab bar has the wrong selected item')
    }
    if (route === '/pages/templates/index') {
      assert.ok(await page.$('.template-card'), 'templates page did not render the native template card')
      assert.ok(await page.$('.template-paper'), 'template card paper preview is missing')
      assert.ok(await page.$('.template-body'), 'template card name area is missing')
    }
    if (route === '/pages/sign/edit') {
      const before = (await page.$$('.sig-layer')).length
      await (await page.$('.signature-library')).tap()
      await page.waitFor(150)
      const choice = await page.$('.signature-choice')
      assert.ok(choice, 'adjustment signature picker did not render a selectable signature')
      await choice.tap()
      await page.waitFor(180)
      assert.equal((await page.$$('.sig-layer')).length, before + 1, 'adjustment signature picker did not apply the selected signature')
      signaturePickerApplied = true
    }
    loaded.push(page.path)
  }
  const backupPage = await miniProgram.reLaunch('/subpackages/settings/backup')
  const passwordInputs = await backupPage.$$('.password-input')
  assert.equal(passwordInputs.length, 1, 'backup password should be optional until a password is entered')
  await (await backupPage.$('.action-button.create')).tap()
  await backupPage.waitFor(5000)
  encryptedBackup = await miniProgram.evaluate(() => {
    const fs = wx.getFileSystemManager()
    const directory = `${wx.env.USER_DATA_PATH}/sign-master/backups`
    const names = fs.readdirSync(directory).filter((name) => name.endsWith('.signmaster')).sort()
    const fileName = names[names.length - 1]
    const text = fs.readFileSync(`${directory}/${fileName}`, 'utf8')
    const content = JSON.parse(text)
    return { fileName, backupCount: names.length, format: content.format, version: content.version, keyMode: content.crypto?.keyMode, compression: content.crypto?.compression, hasCiphertext: Boolean(content.ciphertext), hasMac: Boolean(content.mac), exposesPlaintext: text.includes('smoke-document') }
  })
  assert.equal(encryptedBackup.format, 'signMaster-encrypted-backup', 'native backup is not encrypted')
  assert.equal(encryptedBackup.version, 2, 'native backup version is not encrypted v2')
  assert.equal(encryptedBackup.keyMode, 'application', 'password-free backup did not use application protection')
  assert.equal(encryptedBackup.compression, 'gzip', 'native backup is not compressed before encryption')
  assert.equal(encryptedBackup.backupCount, 1, 'native backup directory contains more than one backup')
  assert.equal(encryptedBackup.hasCiphertext, true, 'native backup missing ciphertext')
  assert.equal(encryptedBackup.hasMac, true, 'native backup missing HMAC')
  assert.equal(encryptedBackup.exposesPlaintext, false, 'native backup leaked project plaintext')
  for (const [index, route] of ['/pages/home/index', '/pages/templates/index', '/pages/signatures/index', '/pages/settings/index'].entries()) {
    await miniProgram.switchTab(route)
    await new Promise((resolve) => setTimeout(resolve, 100))
    const selected = await miniProgram.evaluate(() => {
      const pages = getCurrentPages()
      return pages[pages.length - 1]?.getTabBar?.()?.data?.selected
    })
    assert.equal(selected, index, `${route} custom tab selection reset to the wrong item`)
    tabSelections.push(selected)
  }
  report = { loaded, customTabBar, tabSelections, signaturePickerApplied, encryptedBackup }
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/mp-weixin-smoke.json', JSON.stringify(report, null, 2), 'utf8')
} finally {
  await miniProgram.close()
}
console.log(JSON.stringify(report, null, 2))
