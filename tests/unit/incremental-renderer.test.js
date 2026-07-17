import { describe, expect, it, vi } from 'vitest'
import { createIncrementalSignatureRenderer } from '../../src/core/signature/incrementalRenderer'

describe('createIncrementalSignatureRenderer', () => {
  it('draws only new segments during pointer moves', () => {
    const ctx = {
      setStrokeStyle: vi.fn(),
      setLineWidth: vi.fn(),
      setLineCap: vi.fn(),
      setLineJoin: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      draw: vi.fn(),
      clearRect: vi.fn()
    }
    const renderer = createIncrementalSignatureRenderer(ctx)

    renderer.startStroke({ x: 0, y: 0 }, { color: '#111', width: 4 })
    renderer.addPoint({ x: 10, y: 10 })
    renderer.addPoint({ x: 20, y: 16 })

    expect(ctx.clearRect).not.toHaveBeenCalled()
    expect(ctx.beginPath).toHaveBeenCalledTimes(2)
    expect(ctx.draw).toHaveBeenCalledWith(true)
  })

  it('clears only when full redraw is requested', () => {
    const ctx = {
      setStrokeStyle: vi.fn(),
      setLineWidth: vi.fn(),
      setLineCap: vi.fn(),
      setLineJoin: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      draw: vi.fn(),
      clearRect: vi.fn()
    }
    const renderer = createIncrementalSignatureRenderer(ctx, { width: 300, height: 160 })

    renderer.redraw([
      { color: '#111', width: 4, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }
    ])

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 300, 160)
    expect(ctx.draw).toHaveBeenCalledWith(false)
  })

  it('flushes a batch of move points with one canvas draw call', () => {
    const ctx = {
      setStrokeStyle: vi.fn(), setLineWidth: vi.fn(), setLineCap: vi.fn(), setLineJoin: vi.fn(),
      beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(),
      stroke: vi.fn(), draw: vi.fn(), clearRect: vi.fn()
    }
    const renderer = createIncrementalSignatureRenderer(ctx)

    renderer.startStroke({ x: 0, y: 0 }, { color: '#111', width: 10 })
    renderer.addPoints([{ x: 6, y: 5 }, { x: 12, y: 8 }, { x: 18, y: 10 }])

    expect(ctx.beginPath).toHaveBeenCalledTimes(3)
    expect(ctx.draw).toHaveBeenCalledTimes(1)
    expect(ctx.draw).toHaveBeenCalledWith(true)
  })
})
