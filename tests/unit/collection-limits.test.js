import { describe, expect, it, vi } from 'vitest'
import { requestCollectionCapacity } from '../../src/core/storage/collectionLimits'

describe('collection capacity choice', () => {
  it('allows saving without prompting below the limit', async () => {
    const showModal = vi.fn()
    await expect(requestCollectionCapacity({ currentCount:7, incomingCount:1, limit:8, uniApi:{ showModal } })).resolves.toBe(true)
    expect(showModal).not.toHaveBeenCalled()
  })

  it('supports rolling overwrite when the collection is full', async () => {
    const uniApi = { showModal:vi.fn((options) => options.success({ confirm:true })) }
    await expect(requestCollectionCapacity({ currentCount:8, incomingCount:1, limit:8, label:'已签署文件', cleanupUrl:'/pages/home/index', uniApi })).resolves.toBe(true)
    expect(uniApi.showModal).toHaveBeenCalledWith(expect.objectContaining({ confirmText:'滚动覆盖', cancelText:'手动清理' }))
  })

  it('opens manual cleanup when rolling overwrite is declined', async () => {
    const uniApi = {
      showModal:vi.fn((options) => options.success({ confirm:false })),
      switchTab:vi.fn()
    }
    await expect(requestCollectionCapacity({ currentCount:20, incomingCount:1, limit:20, cleanupUrl:'/pages/signatures/index', uniApi })).resolves.toBe(false)
    expect(uniApi.switchTab).toHaveBeenCalledWith({ url:'/pages/signatures/index' })
  })
})
