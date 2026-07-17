import { describe, expect, it } from 'vitest'
import { eraseStrokes } from '../../src/core/signature/eraser'

describe('signature eraser', () => {
  it('splits a stroke around the erased region', () => {
    const stroke = { color: '#000', width: 4, points: Array.from({ length: 21 }, (_, x) => ({ x: x * 5, y: 20 })) }
    const result = eraseStrokes([stroke], [{ x: 50, y: 0 }, { x: 50, y: 40 }], 8)
    expect(result).toHaveLength(2)
    expect(result[0].points.at(-1).x).toBeLessThan(50)
    expect(result[1].points[0].x).toBeGreaterThan(50)
  })

  it('handles long signatures and eraser paths without quadratic point scans', () => {
    const stroke = { color: '#000', width: 12, points: Array.from({ length: 6000 }, (_, x) => ({ x, y: 100 })) }
    const eraser = Array.from({ length: 1000 }, (_, y) => ({ x: 3000, y: y / 5 }))
    const startedAt = performance.now()
    const result = eraseStrokes([stroke], eraser, 28)

    expect(performance.now() - startedAt).toBeLessThan(250)
    expect(result).toHaveLength(2)
  })
})
