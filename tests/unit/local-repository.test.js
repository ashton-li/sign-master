import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLocal, removeLocal, writeLocal } from '../../src/core/storage/localRepository'

afterEach(() => {
  delete globalThis.uni
  delete globalThis.wx
})

describe('localRepository', () => {
  it('persists through the direct mini program uni storage API', () => {
    const values = new Map()
    globalThis.uni = {
      getStorageSync: vi.fn((key) => values.get(key) ?? ''),
      setStorageSync: vi.fn((key, value) => values.set(key, value)),
      removeStorageSync: vi.fn((key) => values.delete(key))
    }

    writeLocal('signatures', [{ id: 'signature-1' }])
    expect(readLocal('signatures', [])).toEqual([{ id: 'signature-1' }])
    removeLocal('signatures')
    expect(readLocal('signatures', [])).toEqual([])
  })

  it('restores durable metadata from USER_DATA_PATH after Storage is cleared', () => {
    const storage = new Map()
    const files = new Map()
    const directories = new Set()
    globalThis.uni = {
      getStorageSync: vi.fn((key) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key, value) => storage.set(key, value)),
      removeStorageSync: vi.fn((key) => storage.delete(key))
    }
    globalThis.wx = {
      env: { USER_DATA_PATH: '/user' },
      getFileSystemManager: () => ({
        accessSync: (path) => { if (!directories.has(path) && !files.has(path)) throw new Error('missing') },
        mkdirSync: (path) => directories.add(path),
        writeFileSync: (path, value) => files.set(path, value),
        readFileSync: (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path) },
        renameSync: (source, target) => { files.set(target, files.get(source)); files.delete(source) },
        unlinkSync: (path) => files.delete(path)
      })
    }

    writeLocal('templates', [{ id: 'template-1', name: '回执模板' }])
    storage.clear()

    expect(readLocal('templates', [])).toEqual([{ id: 'template-1', name: '回执模板' }])
    expect(storage.get('sign-master:templates')).toEqual([{ id: 'template-1', name: '回执模板' }])
  })

  it('keeps durable records when WeChat rejects an oversized storage item', () => {
    const files = new Map()
    const directories = new Set()
    const removeStorageSync = vi.fn()
    globalThis.uni = {
      getStorageSync: vi.fn(() => ''),
      setStorageSync: vi.fn(() => { throw new Error('exceed storage item max length') }),
      removeStorageSync
    }
    globalThis.wx = {
      env: { USER_DATA_PATH: '/user' },
      getFileSystemManager: () => ({
        accessSync: (path) => { if (!directories.has(path) && !files.has(path)) throw new Error('missing') },
        mkdirSync: (path) => directories.add(path),
        writeFileSync: (path, value) => files.set(path, value),
        readFileSync: (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path) },
        renameSync: (source, target) => { files.set(target, files.get(source)); files.delete(source) },
        unlinkSync: (path) => files.delete(path)
      })
    }

    const records = [{ id: 'file-1', project: { largeSnapshot: 'x'.repeat(1024) } }]
    expect(() => writeLocal('files', records)).not.toThrow()
    expect(readLocal('files', [])).toEqual(records)
    expect(removeStorageSync).toHaveBeenCalledWith('sign-master:files')
  })
})
