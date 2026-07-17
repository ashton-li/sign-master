export const USER_FILE_LIMIT_BYTES = 200 * 1024 * 1024
export const TEMPORARY_CATEGORY = 'temporary'
export const CLEANABLE_CATEGORIES = ['exports', 'thumbnails', 'backups', TEMPORARY_CATEGORY]

const CATEGORY_LABELS = {
  documents: '源文件',
  exports: '导出文件',
  thumbnails: '缩略图缓存',
  projects: '签署工程',
  signatures: '我的签名',
  backups: '本机备份',
  temporary: '临时文件',
  restored: '恢复文件',
  state: '应用数据',
  other: '其他数据'
}

function platformFileSystem() {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      return { fs: wx.getFileSystemManager(), root: `${wx.env.USER_DATA_PATH}/sign-master` }
    }
  } catch {}
  return null
}

export function utf8ByteLength(value) {
  const text = String(value ?? '')
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).byteLength
  return unescape(encodeURIComponent(text)).length
}

function statsSize(stats) {
  return Number(stats?.size || stats?.stats?.size || 0)
}

export function fileSize(filePath, fs = platformFileSystem()?.fs) {
  if (!filePath || !fs) return 0
  try { return statsSize(fs.statSync(filePath)) } catch { return 0 }
}

function readEntries(fs, directory) {
  try { return fs.readdirSync(directory) || [] } catch { return [] }
}

function isDirectory(fs, path) {
  try {
    const stats = fs.statSync(path)
    return typeof stats?.isDirectory === 'function' ? stats.isDirectory() : Boolean(stats?.isDirectory)
  } catch {
    return false
  }
}

function directorySize(fs, directory) {
  return readEntries(fs, directory).reduce((total, name) => {
    const path = `${directory}/${name}`
    return total + (isDirectory(fs, path) ? directorySize(fs, path) : fileSize(path, fs))
  }, 0)
}

function storageInfo(uniApi = globalThis.uni) {
  try {
    const info = uniApi?.getStorageInfoSync?.() || {}
    const used = Number(info.currentSize || 0) * 1024
    const limit = Number(info.limitSize || 0) * 1024
    return { used, limit, available: Math.max(0, limit - used) }
  } catch {
    return { used: 0, limit: 0, available: 0 }
  }
}

export function getCapacityReport(options = {}) {
  const platform = options.platform || platformFileSystem()
  const categories = Object.fromEntries(Object.keys(CATEGORY_LABELS).map((key) => [key, 0]))
  if (platform) {
    readEntries(platform.fs, platform.root).forEach((name) => {
      const path = `${platform.root}/${name}`
      const key = Object.hasOwn(CATEGORY_LABELS, name) ? name : 'other'
      categories[key] += isDirectory(platform.fs, path) ? directorySize(platform.fs, path) : fileSize(path, platform.fs)
    })
  }
  const fileUsed = Object.values(categories).reduce((sum, value) => sum + value, 0)
  const fileLimit = Number(options.fileLimit || USER_FILE_LIMIT_BYTES)
  const storage = storageInfo(options.uniApi)
  return {
    fileUsed,
    fileLimit,
    fileAvailable: Math.max(0, fileLimit - fileUsed),
    percent: fileLimit ? Math.min(100, fileUsed / fileLimit * 100) : 0,
    storage,
    categories: Object.entries(categories).map(([key, bytes]) => ({ key, label: CATEGORY_LABELS[key], bytes }))
  }
}

export function hasWriteCapacity(requiredBytes, options = {}) {
  const report = options.report || getCapacityReport(options)
  const replacementBytes = Math.max(0, Number(options.replacementBytes || 0))
  const required = Math.max(0, Number(requiredBytes || 0))
  return report.fileAvailable + replacementBytes >= required
}

export class StorageCapacityError extends Error {
  constructor(requiredBytes = 0, replacementBytes = 0) {
    super('本机可用空间不足，请先前往“我的-容量管理”清理空间。')
    this.name = 'StorageCapacityError'
    this.code = 'SIGNMASTER_CAPACITY_EXCEEDED'
    this.requiredBytes = Number(requiredBytes || 0)
    this.replacementBytes = Number(replacementBytes || 0)
  }
}

export function assertWriteCapacity(requiredBytes, options = {}) {
  if (!hasWriteCapacity(requiredBytes, options)) throw new StorageCapacityError(requiredBytes, options.replacementBytes)
  return true
}

function removeTreeContents(fs, directory) {
  let released = 0
  readEntries(fs, directory).forEach((name) => {
    const path = `${directory}/${name}`
    if (isDirectory(fs, path)) {
      released += removeTreeContents(fs, path)
      try { fs.rmdirSync(path) } catch {}
      return
    }
    released += fileSize(path, fs)
    try { fs.unlinkSync(path) } catch {}
  })
  return released
}

export function clearCleanableData(categories = CLEANABLE_CATEGORIES) {
  const platform = platformFileSystem()
  if (!platform) return 0
  return categories.reduce((released, category) => {
    if (!CLEANABLE_CATEGORIES.includes(category)) return released
    return released + removeTreeContents(platform.fs, `${platform.root}/${category}`)
  }, 0)
}

export function clearTemporaryFiles() {
  const platform = platformFileSystem()
  if (!platform) return 0
  return removeTreeContents(platform.fs, `${platform.root}/${TEMPORARY_CATEGORY}`)
}

function showCapacityChoice(uniApi, content) {
  return new Promise((resolve) => {
    if (typeof uniApi?.showModal !== 'function') return resolve(false)
    uniApi.showModal({
      title: '本机空间不足',
      content,
      confirmText: '覆盖旧数据',
      cancelText: '去清理',
      confirmColor: '#e55a2f',
      success: ({ confirm }) => resolve(Boolean(confirm)),
      fail: () => resolve(false)
    })
  })
}

export async function ensureWriteCapacity(requiredBytes, options = {}) {
  if (hasWriteCapacity(requiredBytes, options)) return true
  const uniApi = options.uniApi || globalThis.uni
  const overwrite = await showCapacityChoice(uniApi, '当前空间不足以保存该文件。可覆盖可再生成的旧导出和缓存，或前往容量管理手动清理。')
  if (overwrite) {
    clearCleanableData()
    if (hasWriteCapacity(requiredBytes, options)) return true
  } else {
    try { uniApi?.navigateTo?.({ url: '/subpackages/settings/capacity' }) } catch {}
  }
  throw new StorageCapacityError(requiredBytes, options.replacementBytes)
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes || 0))
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 1 : 2)} MB`
}
