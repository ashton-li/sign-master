function showLimitChoice(uniApi, { label, limit }) {
  return new Promise((resolve) => {
    if (typeof uniApi?.showModal !== 'function') return resolve(true)
    uniApi.showModal({
      title: `${label}已达上限`,
      content: `最多保存 ${limit} 个。选择“滚动覆盖”会自动删除最早的数据；也可以先手动清理。`,
      confirmText: '滚动覆盖',
      cancelText: '手动清理',
      confirmColor: '#d86a2f',
      success: ({ confirm }) => resolve(Boolean(confirm)),
      fail: () => resolve(false)
    })
  })
}

export async function requestCollectionCapacity(options = {}) {
  const currentCount = Math.max(0, Number(options.currentCount || 0))
  const incomingCount = Math.max(0, Number(options.incomingCount || 0))
  const limit = Math.max(1, Number(options.limit || 1))
  if (currentCount + incomingCount <= limit) return true
  const uniApi = options.uniApi || globalThis.uni
  const rolling = await showLimitChoice(uniApi, { label: options.label || '数据', limit })
  if (rolling) return true
  try {
    uniApi?.switchTab?.({ url: options.cleanupUrl })
  } catch {}
  return false
}
