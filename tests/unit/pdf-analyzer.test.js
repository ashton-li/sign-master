import { describe, expect, it } from 'vitest'
import { PDFDocument, rgb } from 'pdf-lib'
import { detectPdfUnderlineSlots } from '../../src/core/file/pdfAnalyzer'

describe('PDF underline analyzer', () => {
  it('detects the three signature underlines and excludes the class line', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([600, 840])
    page.drawLine({ start: { x: 100, y: 130 }, end: { x: 520, y: 130 }, thickness: 1, color: rgb(0, 0, 0) })
    page.drawLine({ start: { x: 40, y: 82 }, end: { x: 160, y: 82 }, thickness: 1, color: rgb(0, 0, 0) })
    page.drawLine({ start: { x: 260, y: 82 }, end: { x: 390, y: 82 }, thickness: 1, color: rgb(0, 0, 0) })
    page.drawLine({ start: { x: 440, y: 82 }, end: { x: 560, y: 82 }, thickness: 1, color: rgb(0, 0, 0) })

    const { slots } = await detectPdfUnderlineSlots(await pdf.save())

    expect(slots).toHaveLength(3)
    expect(slots.map((slot) => slot.label)).toEqual(['家长意见', '幼儿姓名', '家长签字'])
    expect(slots.every((slot) => slot.source === 'pdf-underline')).toBe(true)
  })
})
