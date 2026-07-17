import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TEMPLATE_LIMIT, useTemplatesStore } from '../../src/stores/templates'

describe('templates store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps only the most recent templates within the local storage limit', () => {
    const store = useTemplatesStore()
    for (let index = 0; index < TEMPLATE_LIMIT + 2; index += 1) store.saveTemplate({ id: `template-${index}`, name: `template-${index}`, positions: [] })
    expect(store.templates).toHaveLength(TEMPLATE_LIMIT)
    expect(store.templates[0].name).toBe(`template-${TEMPLATE_LIMIT + 1}`)
    expect(store.templates.at(-1).name).toBe('template-2')
  })

  it('keeps embedded signatures bound to their template positions', () => {
    const store = useTemplatesStore()
    const snapshot = { width: 900, height: 500, strokes: [{ points: [{ x: 10, y: 20 }] }] }
    const saved = store.saveTemplate({
      id: 'template-with-signature',
      name: '一键签署模板',
      positions: [{ id: 'slot-1', x: .5, y: .8, width: .3, height: .08 }],
      embeddedSignatures: [{ id: 'embedded-1', slotId: 'slot-1', name: '家长签字', snapshot }]
    })

    expect(saved.embeddedSignatures).toHaveLength(1)
    expect(store.getTemplate('template-with-signature').embeddedSignatures[0]).toMatchObject({ slotId: 'slot-1', name: '家长签字', snapshot })
  })
})
