import CryptoJS from 'crypto-js'
import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate'

export const ENCRYPTED_BACKUP_FORMAT = 'signMaster-encrypted-backup'
export const ENCRYPTED_BACKUP_VERSION = 2
export const BACKUP_KDF_ITERATIONS = 100000
const APPLICATION_BACKUP_SECRET = 'signMaster::offline-backup::v2::application-protection'

function randomWordArray(byteLength) {
  const bytes = new Uint8Array(byteLength)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < byteLength; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  return CryptoJS.lib.WordArray.create(bytes)
}

function deriveKeys(password, saltHex, iterations) {
  const material = CryptoJS.PBKDF2(String(password), CryptoJS.enc.Hex.parse(saltHex), {
    keySize: 16,
    iterations,
    hasher: CryptoJS.algo.SHA256
  })
  return {
    encryptionKey: CryptoJS.lib.WordArray.create(material.words.slice(0, 8), 32),
    authenticationKey: CryptoJS.lib.WordArray.create(material.words.slice(8, 16), 32)
  }
}

function authenticatedContent(envelope) {
  const parts = [envelope.version, envelope.crypto.iterations, envelope.crypto.salt, envelope.crypto.iv]
  if (envelope.crypto.compression) parts.push(envelope.crypto.compression)
  parts.push(envelope.ciphertext)
  return parts.join('.')
}

function constantTimeEqual(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0)
  return difference === 0
}

export function validateBackupPassword(password) {
  const value = String(password || '')
  if (value && value.length < 8) throw new Error('备份密码为空或至少需要 8 个字符')
  return value
}

function resolveSecret(password, keyMode) {
  const value = validateBackupPassword(password)
  if (keyMode === 'application') return APPLICATION_BACKUP_SECRET
  if (!value) throw new Error('此备份设置了密码，请输入备份密码')
  return value
}

export function encryptBackupPayload(payload, password, options = {}) {
  const safePassword = validateBackupPassword(password)
  const keyMode = safePassword ? 'password' : 'application'
  const secret = keyMode === 'password' ? safePassword : APPLICATION_BACKUP_SECRET
  const salt = options.salt || randomWordArray(16).toString(CryptoJS.enc.Hex)
  const iv = options.iv || randomWordArray(16).toString(CryptoJS.enc.Hex)
  const iterations = options.iterations || BACKUP_KDF_ITERATIONS
  const keys = deriveKeys(secret, salt, iterations)
  const compressed = gzipSync(strToU8(JSON.stringify(payload)), { level: 9 })
  const compressedBase64 = CryptoJS.lib.WordArray.create(compressed).toString(CryptoJS.enc.Base64)
  const encrypted = CryptoJS.AES.encrypt(compressedBase64, keys.encryptionKey, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  })
  const envelope = {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    crypto: {
      cipher: 'AES-256-CBC',
      authentication: 'HMAC-SHA256',
      kdf: 'PBKDF2-HMAC-SHA256',
      keyMode,
      compression: 'gzip',
      iterations,
      salt,
      iv
    },
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    mac: ''
  }
  envelope.mac = CryptoJS.HmacSHA256(authenticatedContent(envelope), keys.authenticationKey).toString(CryptoJS.enc.Hex)
  return envelope
}

export function decryptBackupPayload(envelope, password) {
  if (!envelope || envelope.format !== ENCRYPTED_BACKUP_FORMAT || envelope.version !== ENCRYPTED_BACKUP_VERSION) throw new Error('加密备份格式不受支持')
  const keyMode = envelope.crypto?.keyMode || 'password'
  const secret = resolveSecret(password, keyMode)
  const iterations = Number(envelope.crypto?.iterations || 0)
  if (!envelope.crypto?.salt || !envelope.crypto?.iv || !envelope.ciphertext || !envelope.mac || iterations < 10000) throw new Error('加密备份内容不完整')
  const keys = deriveKeys(secret, envelope.crypto.salt, iterations)
  const expectedMac = CryptoJS.HmacSHA256(authenticatedContent(envelope), keys.authenticationKey).toString(CryptoJS.enc.Hex)
  if (!constantTimeEqual(expectedMac, envelope.mac)) throw new Error('备份密码错误或文件已被篡改')
  try {
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(envelope.ciphertext) }, keys.encryptionKey, {
      iv: CryptoJS.enc.Hex.parse(envelope.crypto.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    })
    const text = decrypted.toString(CryptoJS.enc.Utf8)
    if (!text) throw new Error('empty')
    if (!envelope.crypto?.compression) return JSON.parse(text)
    if (envelope.crypto.compression !== 'gzip') throw new Error('unsupported compression')
    const compressed = CryptoJS.enc.Base64.parse(text)
    const bytes = new Uint8Array(compressed.sigBytes)
    for (let index = 0; index < compressed.sigBytes; index += 1) {
      bytes[index] = (compressed.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff
    }
    return JSON.parse(strFromU8(gunzipSync(bytes)))
  } catch {
    throw new Error('备份解密失败，文件可能已损坏')
  }
}
