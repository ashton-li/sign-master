import { describe, expect, it } from 'vitest'
import { createLayer, createLayerEngine, getLayerBounds } from '../../src/core/layers/layerEngine.js'

describe('layerEngine', () => {
  it('creates transformed layer bounds with rotation-safe dirty rectangles', () => {
    const layer = createLayer({
      id: 'sig-1',
      type: 'signature',
      x: 100,
      y: 200,
      width: 120,
      height: 40,
      rotation: 15
    })

    const bounds = getLayerBounds(layer)

    expect(bounds.x).toBeLessThanOrEqual(100)
    expect(bounds.y).toBeLessThanOrEqual(200)
    expect(bounds.width).toBeGreaterThan(120)
    expect(bounds.height).toBeGreaterThan(40)
  })

  it('tracks dirty rectangles only for changed layers', () => {
    const engine = createLayerEngine()
    engine.addLayer(createLayer({ id: 'a', x: 0, y: 0, width: 100, height: 50 }))
    engine.clearDirty()
    engine.updateLayer('a', { x: 30 })

    expect(engine.getDirtyRects()).toHaveLength(1)
    expect(engine.getDirtyRects()[0].x).toBeLessThanOrEqual(0)
  })

  it('supports undo and redo snapshots', () => {
    const engine = createLayerEngine()
    engine.addLayer(createLayer({ id: 'a', x: 0, y: 0, width: 100, height: 50 }))
    engine.updateLayer('a', { x: 50 })

    engine.undo()
    expect(engine.getLayer('a').x).toBe(0)

    engine.redo()
    expect(engine.getLayer('a').x).toBe(50)
  })
})
