import { describe, expect, it } from 'vitest'
import {
  buildSvgPath,
  getStrokeWidth,
  normalizePoint,
  smoothPoints
} from '../../src/core/signature/path.js'

describe('signature path helpers', () => {
  it('normalizes pointer points with fallback pressure', () => {
    expect(normalizePoint({ x: 12, y: 20, t: 100 })).toEqual({
      x: 12,
      y: 20,
      pressure: 0.5,
      t: 100
    })
    expect(normalizePoint({ x: 4, y: 9, pressure: 0.9 })).toMatchObject({
      pressure: 0.9
    })
  })

  it('maps faster movement to thinner stroke width', () => {
    const slow = getStrokeWidth({ x: 0, y: 0, t: 0 }, { x: 4, y: 0, t: 100 }, 6)
    const fast = getStrokeWidth({ x: 0, y: 0, t: 0 }, { x: 40, y: 0, t: 100 }, 6)

    expect(slow).toBeGreaterThan(fast)
    expect(fast).toBeGreaterThanOrEqual(6 * 0.58)
  })

  it('builds a quadratic SVG path from sampled points', () => {
    const path = buildSvgPath([
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 10, t: 16 },
      { x: 20, y: 0, t: 32 },
      { x: 30, y: 8, t: 48 }
    ])

    expect(path.startsWith('M 0 0')).toBe(true)
    expect(path).toContain('Q')
    expect(path).toContain('30 8')
  })

  it('removes points closer than the configured distance', () => {
    const points = smoothPoints(
      [
        { x: 0, y: 0, t: 0 },
        { x: 1, y: 1, t: 10 },
        { x: 8, y: 8, t: 20 }
      ],
      3
    )

    expect(points).toHaveLength(2)
    expect(points[1]).toMatchObject({ x: 8, y: 8 })
  })
})
