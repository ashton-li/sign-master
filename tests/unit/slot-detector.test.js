import { describe, expect, it } from 'vitest'
import { detectSignatureSlots, mergeNearbySlots } from '../../src/core/vision/slotDetector.js'

describe('slotDetector', () => {
  it('detects contract signature slots from document text lines', () => {
    const slots = detectSignatureSlots({
      width: 750,
      height: 1000,
      textLines: [
        { text: '甲方（采购方）：__________________', x: 60, y: 120, width: 520, height: 32 },
        { text: '乙方签字盖章：__________________', x: 60, y: 850, width: 560, height: 36 }
      ]
    })

    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ label: '甲方签字', source: 'keyword' })
    expect(slots[1].y).toBeGreaterThan(0.75)
  })

  it('does not invent slots when no text is available', () => {
    const slots = detectSignatureSlots({ width: 750, height: 1000, textLines: [] })

    expect(slots).toEqual([])
  })

  it('merges nearby duplicate slots', () => {
    const merged = mergeNearbySlots([
      { id: 'a', label: '签字', x: 0.5, y: 0.7, width: 0.2, height: 0.06, confidence: 0.7 },
      { id: 'b', label: '签名', x: 0.51, y: 0.71, width: 0.2, height: 0.06, confidence: 0.9 },
      { id: 'c', label: '盖章', x: 0.2, y: 0.2, width: 0.2, height: 0.06, confidence: 0.8 }
    ])

    expect(merged).toHaveLength(2)
    expect(merged[0].confidence).toBe(0.9)
  })
})
