import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SIGNATURE_LIMIT, useSignaturesStore } from '../../src/stores/signatures'

describe('signatures store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('uses sequential 我的签名 names by default', () => {
    const store = useSignaturesStore()
    store.addSignature({ snapshot: { strokes: [] } })
    store.addSignature({ snapshot: { strokes: [] } })

    expect(store.signatures.map((item) => item.name)).toEqual(['我的签名2', '我的签名1'])
    expect(store.signatures.map((item) => item.label)).toEqual(['我的签名2', '我的签名1'])
  })
  it('keeps only the most recent signatures within the local storage limit', () => {
    const store = useSignaturesStore()
    for (let index = 0; index < SIGNATURE_LIMIT + 2; index += 1) store.addSignature({ snapshot: { strokes: [] } })
    expect(store.signatures).toHaveLength(SIGNATURE_LIMIT)
    expect(store.signatures[0].name).toBe(`我的签名${SIGNATURE_LIMIT + 2}`)
    expect(store.signatures.at(-1).name).toBe('我的签名3')
  })
})
