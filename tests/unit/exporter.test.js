import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { buildExportManifest, createMinimalPdf } from '../../src/core/export/exporter.js'
import { detectImageFormat } from '../../src/core/export/documentExporter.js'
import { createJpegPdf, jpegDimensions } from '../../src/core/export/imagePdf.js'

describe('exporter', () => {
  it('builds an offline export manifest with no network requirement', () => {
    const manifest = buildExportManifest({
      fileName: '采购协议2025.pdf',
      format: 'pdf',
      layers: [{ id: 'sig-1', type: 'signature' }]
    })

    expect(manifest.mode).toBe('offline')
    expect(manifest.fileName).toMatch(/^采购协议2025_已签署_\d{8}-\d{6}\.pdf$/)
    expect((manifest.fileName.match(/\./g) || []).length).toBe(1)
    expect(manifest.layerCount).toBe(1)
  })

  it('removes extra periods from an exported base name', () => {
    const manifest = buildExportManifest({ fileName: '家长.回执.最终版.jpg', format: 'png' })
    expect(manifest.fileName).toMatch(/^家长_回执_最终版_已签署_\d{8}-\d{6}\.png$/)
    expect((manifest.fileName.match(/\./g) || []).length).toBe(1)
  })

  it('creates a minimal PDF payload containing the signature label', () => {
    const pdf = createMinimalPdf({
      title: '采购协议',
      signatures: [{ label: '李大明', x: 120, y: 320 }]
    })

    expect(pdf).toContain('%PDF-1.4')
    expect(pdf).toContain('李大明')
    expect(pdf.endsWith('%%EOF')).toBe(true)
  })

  it('detects image bytes instead of trusting a misleading file extension', () => {
    expect(detectImageFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png')
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(detectImageFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe('webp')
  })

  it('creates a locally valid image PDF without relying on the PDF runtime', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03,
      0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9
    ])
    const pdf = createJpegPdf([{ bytes: jpeg }])
    const text = String.fromCharCode(...pdf)

    expect(jpegDimensions(jpeg)).toEqual({ width: 64, height: 32 })
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/DCTDecode')
    expect(text).toContain('xref')
    expect(text.endsWith('%%EOF')).toBe(true)
  })

  it('loads a PDF generated from the real return-form JPEG', async () => {
    const jpeg = new Uint8Array(readFileSync(new URL('../fixtures/return-form-three-slots.jpg', import.meta.url)))
    const output = createJpegPdf([{ bytes: jpeg }])
    const loaded = await PDFDocument.load(output)

    expect(loaded.getPageCount()).toBe(1)
    expect(loaded.getPage(0).getWidth()).toBeGreaterThan(500)
  })
})
