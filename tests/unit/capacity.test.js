import { describe, expect, it } from 'vitest'
import { assertWriteCapacity, formatBytes, getCapacityReport, hasWriteCapacity, StorageCapacityError, utf8ByteLength } from '../../src/core/storage/capacity'

function fakePlatform() {
  const directories = new Set(['/user/sign-master', '/user/sign-master/documents', '/user/sign-master/exports', '/user/sign-master/temporary'])
  const files = new Map([
    ['/user/sign-master/documents/form.jpg', 3 * 1024 * 1024],
    ['/user/sign-master/exports/signed.pdf', 2 * 1024 * 1024],
    ['/user/sign-master/temporary/abandoned.jpg', 512 * 1024]
  ])
  const children = {
    '/user/sign-master': ['documents', 'exports', 'temporary'],
    '/user/sign-master/documents': ['form.jpg'],
    '/user/sign-master/exports': ['signed.pdf'],
    '/user/sign-master/temporary': ['abandoned.jpg']
  }
  return {
    root: '/user/sign-master',
    fs: {
      readdirSync: (path) => children[path] || [],
      statSync: (path) => directories.has(path)
        ? { size: 0, isDirectory: () => true }
        : { size: files.get(path) || 0, isDirectory: () => false }
    }
  }
}

describe('storage capacity guard', () => {
  it('reports managed file usage by category and storage quota', () => {
    const report = getCapacityReport({ platform: fakePlatform(), fileLimit: 10 * 1024 * 1024, uniApi: { getStorageInfoSync: () => ({ currentSize: 128, limitSize: 1024 }) } })
    expect(report.fileUsed).toBe(5.5 * 1024 * 1024)
    expect(report.fileAvailable).toBe(4.5 * 1024 * 1024)
    expect(report.categories.find((item) => item.key === 'documents').bytes).toBe(3 * 1024 * 1024)
    expect(report.categories.find((item) => item.key === 'temporary').bytes).toBe(512 * 1024)
    expect(report.storage.available).toBe(896 * 1024)
  })

  it('accounts for replacement bytes and throws a friendly capacity error', () => {
    const report = { fileAvailable: 100 }
    expect(hasWriteCapacity(150, { report, replacementBytes: 50 })).toBe(true)
    expect(() => assertWriteCapacity(151, { report, replacementBytes: 50 })).toThrow(StorageCapacityError)
    expect(() => assertWriteCapacity(151, { report, replacementBytes: 50 })).toThrow('容量管理')
  })

  it('formats values and measures multibyte metadata safely', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB')
    expect(utf8ByteLength('签字')).toBe(6)
  })
})
