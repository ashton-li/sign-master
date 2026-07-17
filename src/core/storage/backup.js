import { readLocal, writeLocal } from './localRepository'
import { decryptBackupPayload, encryptBackupPayload, ENCRYPTED_BACKUP_FORMAT, validateBackupPassword } from './backupCrypto'
import { assertWriteCapacity, ensureWriteCapacity, fileSize, StorageCapacityError, utf8ByteLength } from './capacity'

export const BACKUP_FORMAT = 'signMaster-backup'
export const BACKUP_VERSION = 1
export const BACKUP_EXTENSION = 'signmaster'

const REPOSITORY_KEYS = [
  'signatures',
  'templates',
  'files',
  'active-project',
  'identity',
  'security-records',
  'save-signed-files',
  'notification-enabled',
  'home-guide-seen',
  'feedback'
]

function fileExtension(filePath) {
  const match = String(filePath || '').match(/\.([a-zA-Z0-9]{1,12})$/)
  return match?.[1]?.toLowerCase() || 'bin'
}

function timestampName(date = new Date()) {
  const part = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${part(date.getMonth() + 1)}${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`
}

function cloneWithFileTokens(value, userDataPath, readFile, fileRecords, pathIds) {
  if (Array.isArray(value)) return value.map((item) => cloneWithFileTokens(item, userDataPath, readFile, fileRecords, pathIds))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneWithFileTokens(item, userDataPath, readFile, fileRecords, pathIds)]))
  }
  if (typeof value !== 'string' || !userDataPath || !value.startsWith(`${userDataPath}/`)) return value
  if (pathIds.has(value)) return `signmaster-file://${pathIds.get(value)}`
  try {
    const id = `file-${fileRecords.length + 1}`
    const base64 = readFile(value)
    if (typeof base64 !== 'string' || !base64) return value
    pathIds.set(value, id)
    fileRecords.push({ id, extension: fileExtension(value), base64 })
    return `signmaster-file://${id}`
  } catch {
    return value
  }
}

function restoreFileTokens(value, restoredPaths) {
  if (Array.isArray(value)) return value.map((item) => restoreFileTokens(item, restoredPaths))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreFileTokens(item, restoredPaths)]))
  }
  if (typeof value !== 'string' || !value.startsWith('signmaster-file://')) return value
  return restoredPaths.get(value.slice('signmaster-file://'.length)) || ''
}

export function buildBackupPayload(data, options) {
  const fileRecords = []
  const pathIds = new Map()
  const transformed = cloneWithFileTokens(data, options.userDataPath, options.readFile, fileRecords, pathIds)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: options.createdAt || Date.now(),
    app: 'signMaster',
    data: transformed,
    files: fileRecords
  }
}

export function validateBackupPayload(payload) {
  if (!payload || payload.format !== BACKUP_FORMAT) throw new Error('不是签字大师备份文件')
  if (payload.version !== BACKUP_VERSION) throw new Error('备份版本不兼容，请升级签字大师后重试')
  if (!payload.data || typeof payload.data !== 'object' || !Array.isArray(payload.files)) throw new Error('备份文件内容不完整')
  return payload
}

export function restoreBackupPayload(payload, options) {
  validateBackupPayload(payload)
  const restoredPaths = new Map()
  payload.files.forEach((file) => {
    if (!file?.id || !file?.base64) return
    const targetPath = options.writeFile(file)
    restoredPaths.set(file.id, targetPath)
  })
  return restoreFileTokens(payload.data, restoredPaths)
}

function miniProgramFileSystem() {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      return { fs: wx.getFileSystemManager(), userDataPath: wx.env.USER_DATA_PATH }
    }
  } catch {}
  return null
}

function ensureDirectory(fs, directory) {
  try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
}

function readThemeMode() {
  try { return globalThis.uni?.getStorageSync?.('theme-mode') || 'auto' } catch { return 'auto' }
}

function collectRepositoryData() {
  const values = Object.fromEntries(REPOSITORY_KEYS.map((key) => [key, readLocal(key, null)]))
  return { repository: values, themeMode: readThemeMode() }
}

export function createCompleteBackup(password) {
  const safePassword = validateBackupPassword(password)
  const platform = miniProgramFileSystem()
  if (!platform) throw new Error('完整备份仅支持微信小程序环境')
  const payload = buildBackupPayload(collectRepositoryData(), {
    userDataPath: platform.userDataPath,
    readFile: (filePath) => platform.fs.readFileSync(filePath, 'base64')
  })
  const directory = `${platform.userDataPath}/sign-master/backups`
  ensureDirectory(platform.fs, directory)
  const fileName = `signMaster-backup.${BACKUP_EXTENSION}`
  const filePath = `${directory}/${fileName}`
  const encrypted = encryptBackupPayload(payload, safePassword)
  const serialized = JSON.stringify(encrypted)
  assertWriteCapacity(utf8ByteLength(serialized), { replacementBytes: fileSize(filePath, platform.fs) })
  try {
    const existing = platform.fs.readdirSync(directory) || []
    existing.filter((name) => name.endsWith(`.${BACKUP_EXTENSION}`) && name !== fileName).forEach((name) => {
      try { platform.fs.unlinkSync(`${directory}/${name}`) } catch {}
    })
  } catch {}
  platform.fs.writeFileSync(filePath, serialized, 'utf8')
  return { fileName, filePath, fileCount: payload.files.length, createdAt: payload.createdAt, compressed: true }
}

let activeBackupTask = null

export function createCompleteBackupOnce(password) {
  if (activeBackupTask) return activeBackupTask
  activeBackupTask = Promise.resolve().then(() => createCompleteBackup(password)).catch(async (error) => {
    if (!(error instanceof StorageCapacityError)) throw error
    await ensureWriteCapacity(error.requiredBytes, { replacementBytes: error.replacementBytes })
    return createCompleteBackup(password)
  }).finally(() => { activeBackupTask = null })
  return activeBackupTask
}

export function restoreCompleteBackup(filePath, password) {
  const platform = miniProgramFileSystem()
  if (!platform) throw new Error('完整恢复仅支持微信小程序环境')
  const stored = JSON.parse(platform.fs.readFileSync(filePath, 'utf8'))
  const payload = validateBackupPayload(stored.format === ENCRYPTED_BACKUP_FORMAT ? decryptBackupPayload(stored, password) : stored)
  const directory = `${platform.userDataPath}/sign-master/restored`
  ensureDirectory(platform.fs, directory)
  const restoredBytes = payload.files.reduce((sum, file) => sum + Math.ceil(String(file?.base64 || '').length * 0.75), 0)
  const replacementBytes = payload.files.reduce((sum, file) => sum + fileSize(`${directory}/${file.id}.${file.extension || 'bin'}`, platform.fs), 0)
  assertWriteCapacity(restoredBytes, { replacementBytes })
  const data = restoreBackupPayload(payload, {
    writeFile(file) {
      const targetPath = `${directory}/${file.id}.${file.extension || 'bin'}`
      platform.fs.writeFileSync(targetPath, file.base64, 'base64')
      return targetPath
    }
  })
  Object.entries(data.repository || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) writeLocal(key, value)
  })
  if (data.themeMode) globalThis.uni?.setStorageSync?.('theme-mode', data.themeMode)
  return { fileCount: payload.files.length, createdAt: payload.createdAt, themeMode: data.themeMode || 'auto' }
}

export { REPOSITORY_KEYS, timestampName }
