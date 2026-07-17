import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSigningStore } from '../../src/stores/signing'

describe('signing store detection', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaults new signing projects to JPEG export', () => {
    const store = useSigningStore()
    store.resetFlow()
    expect(store.exportFormat).toBe('jpg')
  })

  it('resets the export selection to the first supported format for every picked file', () => {
    const store = useSigningStore()
    store.exportFormat = 'pdf'
    store.setPickedFile({ name:'photo.jpg', path:'/photo.jpg', kind:'image', extension:'jpg', totalPages:1 })
    expect(store.exportFormat).toBe('jpg')

    store.exportFormat = 'png'
    store.setPickedFile({ name:'document.pdf', path:'/document.pdf', kind:'pdf', extension:'pdf', totalPages:1 })
    expect(store.exportFormat).toBe('pdf')

    store.exportFormat = 'jpg'
    store.setPickedFile({ name:'scan.pdf', path:'/scan-1.jpg', kind:'image', extension:'jpg', totalPages:2, pages:[{ path:'/scan-1.jpg' }, { path:'/scan-2.jpg' }] })
    expect(store.exportFormat).toBe('pdf')
  })

  it('keeps CV signature slots when the document detection is refreshed', () => {
    const store = useSigningStore()
    const detectedSlots = [{ id: 'cv-1', label: '签名位1', x: 0.3, y: 0.72, width: 0.32, height: 0.08, source: 'cv-line', confidence: 0.8 }]

    store.setPickedFile({ name: 'scan.jpg', path: '/scan.jpg', kind: 'image', extension: 'jpg', width: 900, height: 1200, detectedSlots })
    store.runDetection()

    expect(store.slots).toEqual(detectedSlots)
  })

  it('replaces the layer when the same signature slot is signed again', () => {
    const store = useSigningStore()
    store.setPickedFile({
      name: 'form.jpg',
      path: '/form.jpg',
      kind: 'image',
      extension: 'jpg',
      width: 900,
      height: 1200,
      detectedSlots: [{ id: 'slot-parent', label: '家长签字', x: 0.7, y: 0.84, width: 0.28, height: 0.08, page: 1 }]
    })
    store.useSavedSignature({ strokes: [], width: 900, height: 500, color: '#111111', pngPath: '/first.png' })
    const layerId = store.layers[0].id
    store.useSavedSignature({ strokes: [], width: 900, height: 500, color: '#222222', pngPath: '/second.png' })

    expect(store.layers).toHaveLength(1)
    expect(store.layers[0].id).toBe(layerId)
    expect(store.layers[0].slotId).toBe('slot-parent')
    expect(store.layers[0].snapshot.pngPath).toBe('/second.png')
  })
})
