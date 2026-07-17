import { describe, expect, it, vi } from 'vitest'
import { persistLocalFile, pickDocumentSource } from '../../src/core/file/sourcePicker'

function createDeferredApi() {
  return {
    chooseImage: vi.fn((options) => {
      options.success({
        tempFilePaths: ['/tmp/camera.jpg'],
        tempFiles: [{ path: '/tmp/camera.jpg', size: 1200 }]
      })
    }),
    chooseMessageFile: vi.fn((options) => {
      options.success({
        tempFiles: [{ name: '合同.pdf', path: '/tmp/contract.pdf', size: 2048 }]
      })
    })
  }
}

describe('pickDocumentSource', () => {
  it('opens the camera for camera source', async () => {
    const api = createDeferredApi()

    const file = await pickDocumentSource('camera', { uniApi: api })

    expect(api.chooseImage).toHaveBeenCalledWith(expect.objectContaining({
      count: 1,
      sourceType: ['camera']
    }))
    expect(file.name).toBe('拍摄文件.jpg')
    expect(file.path).toBe('/tmp/camera.jpg')
  })

  it('opens the album for album source', async () => {
    const api = createDeferredApi()

    await pickDocumentSource('album', { uniApi: api })

    expect(api.chooseImage).toHaveBeenCalledWith(expect.objectContaining({
      count: 9,
      sourceType: ['album']
    }))
  })

  it('opens WeChat file picker for wechat source', async () => {
    const api = createDeferredApi()

    const file = await pickDocumentSource('wechat', { uniApi: api })

    expect(api.chooseMessageFile).toHaveBeenCalledWith(expect.objectContaining({
      count: 1,
      type: 'all'
    }))
    expect(file.name).toBe('合同.pdf')
  })

  it('treats an empty WeChat picker result as cancellation', async () => {
    const api = { chooseMessageFile: vi.fn((options) => options.success({ tempFiles: [] })) }

    await expect(pickDocumentSource('wechat', { uniApi: api })).rejects.toThrow('cancel')
  })

  it('treats an empty album result as cancellation', async () => {
    const api = { chooseImage: vi.fn((options) => options.success({ tempFiles: [], tempFilePaths: [] })) }

    await expect(pickDocumentSource('album', { uniApi: api })).rejects.toThrow('cancel')
  })

  it('copies selected files into a managed USER_DATA_PATH directory', async () => {
    const calls = []
    globalThis.wx = {
      env: { USER_DATA_PATH: '/user' },
      getFileSystemManager: () => ({
        accessSync: () => { throw new Error('missing') },
        mkdirSync: (path, recursive) => calls.push(['mkdir', path, recursive]),
        copyFile: (options) => { calls.push(['copy', options.srcPath, options.destPath]); options.success() }
      })
    }

    const result = await persistLocalFile({ id: 'sig-1', name: '签名.png', path: '/tmp/sign.png', extension: 'png' }, {}, { category: 'signatures' })

    expect(result.path).toBe('/user/sign-master/signatures/sig-1.png')
    expect(result.managed).toBe(true)
    expect(calls).toContainEqual(['copy', '/tmp/sign.png', '/user/sign-master/signatures/sig-1.png'])
    delete globalThis.wx
  })
})
