import { assertWriteCapacity, fileSize, StorageCapacityError, utf8ByteLength } from './capacity'

const PREFIX = 'sign-master:'
const DURABLE_KEYS = new Set(['signatures', 'templates', 'files', 'active-project', 'identity', 'security-records'])

function api() {
  try {
    if (typeof uni !== 'undefined') return uni
  } catch {
    // Fall through to browser/global fallback.
  }
  return globalThis.uni || null
}

function wechatFileSystem() {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      return { fs: wx.getFileSystemManager(), root: `${wx.env.USER_DATA_PATH}/sign-master` }
    }
  } catch {
    // The H5 and unit-test runtimes do not provide the WeChat file system.
  }
  return null
}

function ensureDirectory(fs, path) {
  try {
    fs.accessSync(path)
  } catch {
    fs.mkdirSync(path, true)
  }
}

function durablePath(key) {
  const platform = wechatFileSystem()
  if (!platform || !DURABLE_KEYS.has(key)) return null
  const directory = `${platform.root}/state`
  return { ...platform, directory, filePath: `${directory}/${key}.json` }
}

function readDurable(key) {
  const target = durablePath(key)
  if (!target) return { found: false, value: null }
  try {
    const text = target.fs.readFileSync(target.filePath, 'utf8')
    return { found: true, value: JSON.parse(typeof text === 'string' ? text : String(text)) }
  } catch {
    return { found: false, value: null }
  }
}

function writeDurable(key, value) {
  const target = durablePath(key)
  if (!target) return false
  try {
    ensureDirectory(target.fs, target.directory)
    const text = JSON.stringify(value)
    assertWriteCapacity(utf8ByteLength(text), { replacementBytes: fileSize(target.filePath, target.fs) })
    const temporary = `${target.filePath}.tmp`
    target.fs.writeFileSync(temporary, text, 'utf8')
    try {
      target.fs.renameSync(temporary, target.filePath)
    } catch {
      target.fs.writeFileSync(target.filePath, text, 'utf8')
      try { target.fs.unlinkSync(temporary) } catch {}
    }
    return true
  } catch (error) {
    if (error instanceof StorageCapacityError) throw error
    return false
  }
}

function removeDurable(key) {
  const target = durablePath(key)
  if (!target) return
  try { target.fs.unlinkSync(target.filePath) } catch {}
}

export function readLocal(key, fallback) {
  const storageKey = `${PREFIX}${key}`
  try {
    const durable = readDurable(key)
    if (durable.found) {
      try {
        if (typeof api()?.setStorageSync === 'function') api().setStorageSync(storageKey, durable.value)
      } catch {
        try { api()?.removeStorageSync?.(storageKey) } catch {}
      }
      return durable.value
    }

    let value = fallback
    if (typeof api()?.getStorageSync === 'function') {
      const stored = api().getStorageSync(storageKey)
      value = stored === '' || stored == null ? fallback : stored
    } else if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      value = stored == null || stored === '' ? fallback : JSON.parse(stored)
    }
    if (DURABLE_KEYS.has(key) && value !== fallback) writeDurable(key, value)
    return value
  } catch {
    return fallback
  }
}

export function writeLocal(key, value) {
  const storageKey = `${PREFIX}${key}`
  const durableWritten = DURABLE_KEYS.has(key) ? writeDurable(key, value) : false
  try {
    if (typeof api()?.setStorageSync === 'function') api().setStorageSync(storageKey, value)
    else if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(value))
  } catch (error) {
    try { api()?.removeStorageSync?.(storageKey) } catch {}
    if (!durableWritten) throw error
  }
  return value
}

export function removeLocal(key) {
  const storage = api()
  const storageKey = `${PREFIX}${key}`
  if (typeof storage?.removeStorageSync === 'function') storage.removeStorageSync(storageKey)
  else if (typeof storage?.setStorageSync === 'function') storage.setStorageSync(storageKey, '')
  else if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey)
  removeDurable(key)
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export { DURABLE_KEYS }
