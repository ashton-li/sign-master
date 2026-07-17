const DEFAULT_WIDTH_RATIO = 0.32
const DEFAULT_HEIGHT_RATIO = 0.064

const KEYWORD_RULES = [
  { pattern: /(甲方|采购方)/, label: '甲方签字' },
  { pattern: /(乙方|供应方)/, label: '乙方签字' },
  { pattern: /(签字|签名|盖章|签署)/, label: '签字确认' }
]

function clampRatio(value) {
  return Math.max(0, Math.min(1, value))
}

function toSlot(line, doc, rule, index) {
  const width = doc.width || 750
  const height = doc.height || 1000
  const slotWidth = Math.min(0.4, Math.max(DEFAULT_WIDTH_RATIO, (line.width || 240) / width * 0.48))
  const slotHeight = Math.min(0.09, Math.max(DEFAULT_HEIGHT_RATIO, (line.height || 36) / height * 1.6))
  const x = clampRatio(((line.x || 0) + (line.width || width * 0.55) * 0.62) / width)
  const y = clampRatio(((line.y || 0) + (line.height || 36) * 0.16) / height)

  return {
    id: `slot-${index + 1}`,
    label: rule.label,
    x: clampRatio(Math.min(x, 1 - slotWidth - 0.03)),
    y: clampRatio(Math.min(y, 1 - slotHeight - 0.03)),
    width: slotWidth,
    height: slotHeight,
    confidence: rule.pattern.source.includes('甲方') || rule.pattern.source.includes('乙方') ? 0.88 : 0.76,
    source: 'keyword'
  }
}

export function mergeNearbySlots(slots, threshold = 0.08) {
  const sorted = [...slots].sort((a, b) => b.confidence - a.confidence)
  const merged = []

  sorted.forEach((slot) => {
    const duplicate = merged.some((item) => Math.hypot(item.x - slot.x, item.y - slot.y) < threshold)
    if (!duplicate) merged.push(slot)
  })

  return merged
}

export function detectSignatureSlots(documentMeta) {
  const lines = documentMeta?.textLines || []
  const detected = []

  lines.forEach((line) => {
    const rule = KEYWORD_RULES.find((item) => item.pattern.test(line.text || ''))
    if (rule) detected.push(toSlot(line, documentMeta, rule, detected.length))
  })

  return mergeNearbySlots(detected)
    .sort((a, b) => a.y - b.y)
    .map((slot, index) => ({
      ...slot,
      id: slot.id || `slot-${index + 1}`
    }))
}
