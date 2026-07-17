import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

function readText(relativePath) {
  return fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

describe('mp-weixin compatibility guards', () => {
  it('does not leave raw Tailwind directives in global WXSS source', () => {
    const wxssSource = readText('src/uni.scss')

    expect(wxssSource).not.toMatch(/@tailwind\s+/)
  })

  it('does not declare unsupported write album permission in manifest', () => {
    const manifest = JSON.parse(readText('src/manifest.json'))

    expect(manifest.permission?.['scope.writePhotosAlbum']).toBeUndefined()
    expect(manifest['mp-weixin']?.permission?.['scope.writePhotosAlbum']).toBeUndefined()
  })

  it('packages the verification subpackage without cloud identity code or an AppSecret', () => {
    const pages = JSON.parse(readText('src/pages.json'))
    const sourceFiles = ['src/core/security/identity.js', 'src/pages/sign/preview.vue', 'scripts/prepare-mp-weixin-dist.mjs'].map(readText).join('\n')

    expect(pages.subPackages.some((item) => item.root === 'subpackages/security' && item.pages.some((page) => page.path === 'verify'))).toBe(true)
    expect(sourceFiles).not.toMatch(/appsecret|app_secret/i)
    expect(sourceFiles).not.toMatch(/cloud\.callFunction|signmasterIdentity|wechat-openid/i)
    expect(readText('src/pages/sign/preview.vue')).toContain('shareFileMessage')
  })

  it('uses a distinct signature-library icon and packages backup recovery', () => {
    const pages = JSON.parse(readText('src/pages.json'))
    const tabMarkup = readText('src/custom-tab-bar/index.wxml')

    expect(tabMarkup).toContain('icon-signature-library')
    expect(tabMarkup.match(/sign-disc/g)).toHaveLength(1)
    expect(pages.subPackages.some((item) => item.root === 'subpackages/settings' && item.pages.some((page) => page.path === 'backup'))).toBe(true)
    expect(readText('src/subpackages/settings/backup.vue')).toContain('shareFileMessage')
    expect(readText('src/custom-tab-bar/index.wxml')).toContain("dark ? 'dark' : ''")
    expect(readText('src/custom-tab-bar/index.wxss')).toContain('.tabbar.dark')
  })

  it('keeps template gallery sizing inside its own mini-program component boundary', () => {
    const templateCard = readText('src/components/TemplateCard.vue')

    expect(templateCard).toContain('<view :class="[\'template-card\', { gallery }]"')
    expect(templateCard).not.toContain('<GlassCard')
  })

  it('does not initialize large signing or signature stores on file and template tab startup', () => {
    const home = readText('src/pages/home/index.vue')
    const templates = readText('src/pages/templates/index.vue')

    expect(home).not.toContain("import { useSigningStore }")
    expect(templates).not.toMatch(/\nconst signaturesStore = useSignaturesStore\(\)/)
  })

  it('enables WeChat component lazy loading and subpackage optimization', () => {
    const manifest = JSON.parse(readText('src/manifest.json'))
    const weixin = manifest['mp-weixin']

    expect(weixin?.lazyCodeLoading).toBe('requiredComponents')
    expect(weixin?.optimization?.subPackages).toBe(true)
  })

  it('uses native tap and touch-end activation for detected signature slots', () => {
    const signPage = readText('src/pages/sign/index.vue')
    const previewPage = readText('src/pages/sign/preview.vue')

    expect(signPage).toContain('@touchend.stop="handleSlotActivate(slot)"')
    expect(signPage).toContain('@tap.stop="handleSlotActivate(slot)"')
    expect(previewPage).toContain("[{ value: 'jpg', label: 'JPEG'")
  })

  it('packages independent capacity/about pages and keeps mini-program detection experimental', () => {
    const pages = JSON.parse(readText('src/pages.json'))
    const settingsPackage = pages.subPackages.find((item) => item.root === 'subpackages/settings')
    const signPage = readText('src/pages/sign/index.vue')
    const scanner = readText('src/pages/sign/scan.vue')

    expect(settingsPackage.pages.map((page) => page.path)).toEqual(expect.arrayContaining(['capacity', 'about']))
    expect(signPage).toContain('签字位识别为实验性功能')
    expect(signPage).toMatch(/#ifdef MP-WEIXIN[\s\S]*startDefaultSignature\(file\)/)
    expect(scanner).toContain('@tap.stop="handleCapture"')
    expect(scanner).not.toContain('handleCameraFrame')
    expect(scanner).not.toContain('auto-toggle')
    expect(scanner).toContain('detectSignatures:false')
    expect(scanner).toContain('yieldToUi:true')
    expect(scanner).toContain('cropQueue')
    expect(scanner).toContain('正在后台裁切，可继续拍摄')
    expect(scanner).toContain('createScanPdfFromPathsInline')
    expect(scanner).toContain("'%PDF-1.4")
    expect(scanner).not.toContain("from './scanPdf'")
    expect(scanner).not.toContain("from '../../core/export/imagePdf'")
    expect(scanner).toContain('saveScanPdfBytes')
    expect(scanner).not.toContain("from '../../core/export/pdfFileSaver'")
    expect(scanner).not.toContain('exportSignedPdf')
    expect(scanner.indexOf('<camera')).toBeLessThan(scanner.indexOf('<cover-view class="camera-actions"'))
    expect(scanner.slice(scanner.indexOf('<camera'), scanner.indexOf('<cover-view class="camera-actions"'))).toContain('/>')
    expect(scanner).toContain('@touchmove.stop.prevent="handleDragMove($event)"')
    expect(scanner).toContain('@click.stop="handlePreview(index)"')
    const editor = readText('src/pages/sign/edit.vue')
    expect(editor).toContain('@touchend.stop="handleUseSignature(signature)"')
    expect(editor).toContain('@tap.stop="handleUseSignature(signature)"')
    expect(editor).toContain('signaturePreviewSource(signature.snapshot)')
  })

  it('keeps support and privacy copy honest and exposes the official support channels', () => {
    const help = readText('src/subpackages/settings/help.vue')
    const privacy = readText('src/subpackages/settings/privacy.vue')
    const about = readText('src/subpackages/settings/about.vue')
    const settings = readText('src/pages/settings/index.vue')
    const logo = readText('src/components/AppLogo.vue')
    const filing = readText('src/components/FilingFooter.vue')
    expect(help).toContain('/static/support-qrcode.jpg')
    expect(help).toContain('VITE_CONTACT_EMAIL')
    expect(help).toContain('此处不会自动上传')
    expect(help).not.toContain('保存反馈')
    expect(privacy).toContain('不上传至签字大师的业务服务器')
    expect(privacy).toContain('不构成实名身份认证')
    expect(about).toContain('<AppLogo />')
    expect(about).toContain('<FilingFooter />')
    expect(settings).toContain('<FilingFooter />')
    expect(logo).toContain('/static/app-logo.png')
    expect(filing).toContain('闽ICP备2026014225号-3X')
    expect(filing).toContain('https://beian.miit.gov.cn/')
    expect(help).not.toContain('<PageShell :tab="false" compact>')
  })

  it('persists image exports before stamping evidence and tracks abandoned work as temporary data', () => {
    const preview = readText('src/pages/sign/preview.vue')
    const picker = readText('src/core/file/sourcePicker.js')
    const capacity = readText('src/subpackages/settings/capacity.vue')
    const signPage = readText('src/pages/sign/index.vue')

    expect(preview.indexOf("category:'exports'")).toBeLessThan(preview.indexOf('stampFileEvidence(persisted.path'))
    expect(preview).not.toContain('stampFileEvidence(result.tempFilePath')
    expect(signPage).toContain("category:'temporary'")
    expect(picker).toContain('discardTemporaryDocument')
    expect(capacity).toContain('clearTemporaryFiles')
    expect(capacity).toContain('未完成的文件导入')
  })
})
