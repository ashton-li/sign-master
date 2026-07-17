import { describe, expect, it } from 'vitest'
import { resolveTemplatePositions } from '../../src/core/templates/templatePositions'

describe('template positions', () => {
  it('uses the adjusted signature layer bounds instead of stale detected bounds', () => {
    const slots = [{ id: 'slot-1', label: '家长签字', x: 0.1, y: 0.2, width: 0.2, height: 0.05, page: 1 }]
    const layers = [{ slotId: 'slot-1', x: 132, y: 375, width: 132, height: 50, page: 2, rotation: -15, opacity: 0.7 }]

    expect(resolveTemplatePositions(slots, layers)).toEqual([{
      id: 'slot-1',
      label: '家长签字',
      x: 0.4,
      y: 0.75,
      width: 0.4,
      height: 0.1,
      page: 2,
      rotation: -15,
      opacity: 0.7
    }])
  })

  it('keeps a detected position when it has no adjusted layer', () => {
    const slot = { id: 'slot-1', x: 0.2, y: 0.3, width: 0.4, height: 0.1 }
    expect(resolveTemplatePositions([slot], [])).toEqual([slot])
  })
})
