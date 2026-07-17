import { describe, expect, it } from 'vitest'
import { calculateContainRect, calculatePinchTransform, getTouchMetrics, snapLayerToGuides } from '../../src/core/gestures/transform'

describe('gesture transform', () => {
  it('calculates two-finger scale and rotation', () => {
    const start = getTouchMetrics([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    const current = getTouchMetrics([{ x: 0, y: 0 }, { x: 0, y: 200 }])
    const result = calculatePinchTransform({ width: 100, height: 40, rotation: 0 }, start, current)
    expect(result.width).toBe(200)
    expect(result.height).toBe(80)
    expect(result.rotation).toBeCloseTo(90)
  })

  it('snaps a layer center to editor guides', () => {
    const result = snapLayerToGuides({ x: 96, y: 228 }, { width: 100, height: 40 }, { width: 300, height: 500 })
    expect(result).toMatchObject({ x: 100, y: 230, guideX: true, guideY: true })
  })

  it('maps an aspect-fit document to its actual visible rectangle', () => {
    expect(calculateContainRect(360, 600, 300, 600)).toEqual({ left: 30, top: 0, width: 300, height: 600 })
    expect(calculateContainRect(360, 600, 720, 360)).toEqual({ left: 0, top: 210, width: 360, height: 180 })
  })
})
