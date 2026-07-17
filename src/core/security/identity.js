import { readLocal, writeLocal } from '../storage/localRepository'
import { sha256Hex } from './hash'
import { assertWriteCapacity, fileSize, utf8ByteLength } from '../storage/capacity'

const ID_PREFIX = 'sigpen_user_'
let memoryIdentity = null

function randomSecret() {
  const bytes = new Uint8Array(32)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function generateUserId() {
  return `${ID_PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function userIdFile() {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      return { fs: wx.getFileSystemManager(), root: `${wx.env.USER_DATA_PATH}/sign-master`, path: `${wx.env.USER_DATA_PATH}/sign-master/user_id.txt` }
    }
  } catch {}
  return null
}

function readFileUserId() {
  const target = userIdFile()
  if (!target) return ''
  try {
    const id = String(target.fs.readFileSync(target.path, 'utf8') || '').trim()
    return id.startsWith(ID_PREFIX) ? id : ''
  } catch {
    return ''
  }
}

function writeFileUserId(id) {
  const target = userIdFile()
  if (!target || !id) return false
  try {
    try { target.fs.accessSync(target.root) } catch { target.fs.mkdirSync(target.root, true) }
    assertWriteCapacity(utf8ByteLength(id), { replacementBytes: fileSize(target.path, target.fs) })
    target.fs.writeFileSync(target.path, id, 'utf8')
    return true
  } catch {
    return false
  }
}

export function getIdentity() {
  if (memoryIdentity) return memoryIdentity
  const stored = readLocal('identity', null)
  const fromFile = readFileUserId()
  const fromState = stored?.source === 'local-file' && String(stored.id || '').startsWith(ID_PREFIX) ? stored.id : ''
  const id = fromFile || fromState || generateUserId()
  writeFileUserId(id)
  memoryIdentity = {
    id,
    source: 'local-file',
    secret: stored?.secret || randomSecret(),
    createdAt: stored?.createdAt || Date.now()
  }
  writeLocal('identity', memoryIdentity)
  return memoryIdentity
}

export function identityLabel(identity = getIdentity()) {
  return `本机稳定 ID · ${sha256Hex(identity.id).slice(0, 10)}`
}

export async function initializeIdentity() {
  return getIdentity()
}

export function resetIdentityMemory() {
  memoryIdentity = null
}
