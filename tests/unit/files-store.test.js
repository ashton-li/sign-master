import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SIGNED_FILE_LIMIT, useFilesStore } from '../../src/stores/files'

describe('files store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('replaces a previous export from the same signing project', () => {
    const store = useFilesStore()
    const project = { document: { id: 'document-1', name: 'contract.jpg' } }
    const first = store.addSignedFile({ name: 'contract', path: '/first.pdf', project })
    const second = store.addSignedFile({ name: 'contract', path: '/second.pdf', project })

    expect(store.files).toHaveLength(1)
    expect(store.files[0].path).toBe('/second.pdf')
    expect(store.files[0].project).toBeUndefined()
    expect(store.getProject(store.files[0])).toEqual(project)
    expect(second.id).toBe(first.id)
  })
  it('limits signed file history to the most recent records', () => {
    const store = useFilesStore()
    for (let index = 0; index < SIGNED_FILE_LIMIT + 2; index += 1) {
      store.addSignedFile({ name: `file-${index}`, path: `/file-${index}.pdf`, project: { document: { id: `document-${index}` } } })
    }
    expect(store.files).toHaveLength(SIGNED_FILE_LIMIT)
    expect(store.files[0].name).toBe(`file-${SIGNED_FILE_LIMIT + 1}`)
    expect(store.files.at(-1).name).toBe('file-2')
  })
})
