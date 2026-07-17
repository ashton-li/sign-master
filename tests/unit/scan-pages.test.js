import { describe, expect, it } from 'vitest'
import { moveScanPage } from '../../src/core/file/scanPages'

describe('scan page ordering', () => {
  it('moves a scanned page without mutating the source list', () => {
    const source = [{ id:'page-1' }, { id:'page-2' }, { id:'page-3' }]
    const reordered = moveScanPage(source, 2, 0)

    expect(reordered.map((page) => page.id)).toEqual(['page-3', 'page-1', 'page-2'])
    expect(source.map((page) => page.id)).toEqual(['page-1', 'page-2', 'page-3'])
  })

  it('clamps invalid source and target indexes', () => {
    expect(moveScanPage([{ id:'a' }, { id:'b' }], 9, -3).map((page) => page.id)).toEqual(['b', 'a'])
    expect(moveScanPage([], 0, 1)).toEqual([])
  })
})
