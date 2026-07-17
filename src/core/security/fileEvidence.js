import { constantTimeEqual, hmacSha256Hex, sha256Hex } from './hash'
import { getIdentity } from './identity'
import { verifyAttestationEnvelope } from './attestation'

const VERSION = 'SMV2'
const PRODUCT = 'signMaster'
const MARKER = 'SMV2:'
const SYSTEM_EVIDENCE_KEY = sha256Hex('signMaster|offline-file-evidence|v2|2026-07')

function utf8Encode(value) {
  const text = String(value || '')
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)
  const encoded = unescape(encodeURIComponent(text))
  return Uint8Array.from(encoded, (character) => character.charCodeAt(0))
}

function utf8Decode(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  return decodeURIComponent(escape(String.fromCharCode(...bytes)))
}

function bytesToBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const value = (first << 16) | ((second || 0) << 8) | (third || 0)
    output += alphabet[(value >>> 18) & 63]
    output += alphabet[(value >>> 12) & 63]
    output += index + 1 < bytes.length ? alphabet[(value >>> 6) & 63] : '='
    output += index + 2 < bytes.length ? alphabet[value & 63] : '='
  }
  return output
}

function base64ToBytes(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = String(value || '').replace(/[^A-Za-z0-9+/=]/g, '')
  const output = []
  for (let index = 0; index < clean.length; index += 4) {
    const first = alphabet.indexOf(clean[index])
    const second = alphabet.indexOf(clean[index + 1])
    const third = clean[index + 2] === '=' ? 0 : alphabet.indexOf(clean[index + 2])
    const fourth = clean[index + 3] === '=' ? 0 : alphabet.indexOf(clean[index + 3])
    const value = (first << 18) | (second << 12) | (third << 6) | fourth
    output.push((value >>> 16) & 255)
    if (clean[index + 2] !== '=') output.push((value >>> 8) & 255)
    if (clean[index + 3] !== '=') output.push(value & 255)
  }
  return Uint8Array.from(output)
}

function joinBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => { output.set(part, offset); offset += part.length })
  return output
}

function canonicalPayload(value) {
  return JSON.stringify({
    version: value.version,
    product: value.product,
    exportedAt: value.exportedAt,
    fileName: value.fileName,
    format: value.format,
    documentId: value.documentId,
    ownerHash: value.ownerHash,
    signatures: value.signatures,
    contentDigest: value.contentDigest
  })
}

function normalizeBounds(layer) {
  return {
    x: Math.max(0, Math.min(330, Math.round(Number(layer.x || 0)))),
    y: Math.max(0, Math.min(500, Math.round(Number(layer.y || 0)))),
    width: Math.max(1, Math.min(330, Math.round(Number(layer.width || 1)))),
    height: Math.max(1, Math.min(500, Math.round(Number(layer.height || 1))))
  }
}

export function createFileEvidence(input, identity = getIdentity()) {
  const layers = (input?.layers || []).filter((layer) => layer.visible !== false && layer.snapshot?.attestation)
  return {
    version: VERSION,
    product: PRODUCT,
    exportedAt: new Date().toISOString(),
    fileName: String(input?.fileName || ''),
    format: String(input?.format || '').toLowerCase(),
    documentId: String(input?.documentId || ''),
    ownerHash: sha256Hex(identity.id),
    signatures: layers.map((layer, index) => ({
      id: String(layer.id || `signature-${index + 1}`),
      label: String(layer.label || `签字${index + 1}`),
      page: Math.max(1, Number(layer.page || 1)),
      bounds: normalizeBounds(layer),
      attestation: { ...layer.snapshot.attestation }
    }))
  }
}

function sealEvidence(evidence, sourceBytes) {
  const value = { ...evidence, contentDigest: sha256Hex(sourceBytes) }
  value.seal = hmacSha256Hex(SYSTEM_EVIDENCE_KEY, canonicalPayload(value))
  return value
}

function crc32(parts) {
  let crc = 0xffffffff
  parts.forEach((bytes) => {
    for (const byte of bytes) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  })
  return (crc ^ 0xffffffff) >>> 0
}

function uint32(value) {
  return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255])
}

function isJpeg(bytes) {
  return bytes[0] === 0xff && bytes[1] === 0xd8
}

function isPng(bytes) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function isPdf(bytes) {
  return utf8Decode(bytes.slice(0, 5)) === '%PDF-'
}

function attachJpeg(bytes, markerBytes) {
  if (markerBytes.length > 65531) throw new Error('防伪载荷过大')
  const segment = joinBytes([Uint8Array.from([0xff, 0xef]), Uint8Array.from([((markerBytes.length + 2) >>> 8) & 255, (markerBytes.length + 2) & 255]), markerBytes])
  return joinBytes([bytes.slice(0, 2), segment, bytes.slice(2)])
}

function attachPng(bytes, markerBytes) {
  const type = utf8Encode('smTa')
  const chunk = joinBytes([uint32(markerBytes.length), type, markerBytes, uint32(crc32([type, markerBytes]))])
  let iend = -1
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
    if (utf8Decode(bytes.slice(offset + 4, offset + 8)) === 'IEND') { iend = offset; break }
    offset += length + 12
  }
  if (iend < 0) throw new Error('无效的 PNG 文件')
  return joinBytes([bytes.slice(0, iend), chunk, bytes.slice(iend)])
}

export function attachFileEvidence(input, evidence) {
  const sourceBytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const manifest = sealEvidence(evidence, sourceBytes)
  const markerBytes = utf8Encode(`${MARKER}${bytesToBase64(utf8Encode(JSON.stringify(manifest)))}`)
  let bytes
  if (isJpeg(sourceBytes)) bytes = attachJpeg(sourceBytes, markerBytes)
  else if (isPng(sourceBytes)) bytes = attachPng(sourceBytes, markerBytes)
  else bytes = joinBytes([sourceBytes, utf8Encode(`\n%${utf8Decode(markerBytes)}\n`)])
  return { bytes, manifest }
}

function lastIndexOfBytes(bytes, pattern) {
  for (let offset = bytes.length - pattern.length; offset >= 0; offset -= 1) {
    let matched = true
    for (let index = 0; index < pattern.length; index += 1) if (bytes[offset + index] !== pattern[index]) { matched = false; break }
    if (matched) return offset
  }
  return -1
}

function removeEvidenceContainer(bytes, markerOffset) {
  if (isJpeg(bytes) && markerOffset >= 6 && bytes[markerOffset - 4] === 0xff && bytes[markerOffset - 3] === 0xef) {
    const segmentLength = (bytes[markerOffset - 2] << 8) | bytes[markerOffset - 1]
    const start = markerOffset - 4
    return joinBytes([bytes.slice(0, start), bytes.slice(start + segmentLength + 2)])
  }
  if (isPng(bytes) && markerOffset >= 8) {
    const start = markerOffset - 8
    const length = (bytes[start] * 0x1000000) + (bytes[start + 1] << 16) + (bytes[start + 2] << 8) + bytes[start + 3]
    if (utf8Decode(bytes.slice(start + 4, start + 8)) === 'smTa') return joinBytes([bytes.slice(0, start), bytes.slice(start + length + 12)])
  }
  if (isPdf(bytes) && markerOffset >= 2 && bytes[markerOffset - 1] === 0x25) return bytes.slice(0, markerOffset - 2)
  return bytes.slice(0, Math.max(0, markerOffset - 1))
}

function evidencePayloadEnd(bytes, markerOffset, markerLength) {
  if (isJpeg(bytes) && markerOffset >= 4 && bytes[markerOffset - 4] === 0xff && bytes[markerOffset - 3] === 0xef) {
    const segmentLength = (bytes[markerOffset - 2] << 8) | bytes[markerOffset - 1]
    return Math.min(bytes.length, markerOffset + Math.max(0, segmentLength - 2))
  }
  if (isPng(bytes) && markerOffset >= 8) {
    const start = markerOffset - 8
    const length = (bytes[start] * 0x1000000) + (bytes[start + 1] << 16) + (bytes[start + 2] << 8) + bytes[start + 3]
    if (utf8Decode(bytes.slice(start + 4, start + 8)) === 'smTa') return Math.min(bytes.length, markerOffset + length)
  }
  let end = markerOffset + markerLength
  while (end < bytes.length) {
    const character = String.fromCharCode(bytes[end])
    if (!/[A-Za-z0-9+/=]/.test(character)) break
    end += 1
  }
  return end
}

export function extractFileEvidence(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const markerBytes = utf8Encode(MARKER)
  const markerOffset = lastIndexOfBytes(bytes, markerBytes)
  if (markerOffset < 0) return { found: false, valid: false, reason: '未发现 signMaster V2 防伪载荷', manifest: null, sourceBytes: bytes }
  const end = evidencePayloadEnd(bytes, markerOffset, markerBytes.length)
  try {
    const encoded = utf8Decode(bytes.slice(markerOffset + markerBytes.length, end))
    const manifest = JSON.parse(utf8Decode(base64ToBytes(encoded)))
    const sourceBytes = removeEvidenceContainer(bytes, markerOffset)
    const verification = verifyFileEvidence(manifest, sourceBytes)
    return { found: true, manifest, sourceBytes, ...verification }
  } catch {
    return { found: true, valid: false, reason: '防伪载荷无法解析或已经损坏', manifest: null, sourceBytes: bytes }
  }
}

export function verifyFileEvidence(manifest, sourceBytes) {
  if (!manifest || manifest.version !== VERSION || manifest.product !== PRODUCT) return { valid: false, reason: '不是受支持的 signMaster 防伪版本' }
  const sealValid = constantTimeEqual(manifest.seal, hmacSha256Hex(SYSTEM_EVIDENCE_KEY, canonicalPayload(manifest)))
  const contentValid = constantTimeEqual(manifest.contentDigest, sha256Hex(sourceBytes))
  if (!sealValid) return { valid: false, sealValid, contentValid, reason: '系统防伪签章无效' }
  if (!contentValid) return { valid: false, sealValid, contentValid, reason: '文件正文已变更，防伪载荷与文件不匹配' }
  return { valid: true, sealValid, contentValid, reason: 'signMaster V2 系统签章及文件摘要有效' }
}

export function buildFileVerificationReport(packet, options = {}) {
  const identity = options.identity || getIdentity()
  const storedSignatures = options.signatures || []
  const manifest = packet?.manifest
  const systemValid = Boolean(packet?.valid && manifest)
  const ownerMatch = systemValid && manifest.ownerHash === sha256Hex(identity.id)
  const signatures = (manifest?.signatures || []).map((entry) => {
    const envelope = verifyAttestationEnvelope(entry.attestation, identity)
    const stored = storedSignatures.find((item) => {
      const attestation = item.snapshot?.attestation
      return attestation?.signatureHash === entry.attestation?.signatureHash && attestation?.mac === entry.attestation?.mac
    })
    return {
      ...entry,
      ownerValid: ownerMatch && envelope.valid,
      storedName: stored?.name || '',
      result: ownerMatch && envelope.valid ? (stored ? `匹配本机签名“${stored.name}”` : '签章属于当前用户') : '不属于当前用户或签章无效'
    }
  })
  const userValid = systemValid && ownerMatch && signatures.length > 0 && signatures.every((entry) => entry.ownerValid)
  return {
    reportId: sha256Hex(`${manifest?.seal || ''}|${Date.now()}`).slice(0, 16).toUpperCase(),
    checkedAt: Date.now(),
    system: { valid: systemValid, reason: packet?.reason || '未发现系统防伪证据' },
    user: {
      valid: userValid,
      ownerMatch,
      reason: !systemValid ? '系统来源未通过，停止用户归属认定' : !ownerMatch ? '文件签章不属于当前用户' : !signatures.length ? '文件中没有可提取的签字证据' : userValid ? `提取到 ${signatures.length} 个签字，均属于当前用户` : '存在无法通过当前用户签章校验的签字'
    },
    manifest,
    signatures
  }
}

export async function readFileBytes(path) {
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.getFileSystemManager === 'function') {
    return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
      filePath: path,
      success: (result) => resolve(result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data)),
      fail: reject
    }))
  }
  // #endif
  const response = await fetch(path)
  if (!response.ok) throw new Error(`文件读取失败：${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function stampFileEvidence(path, evidence) {
  const sourceBytes = await readFileBytes(path)
  const stamped = attachFileEvidence(sourceBytes, evidence)
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.getFileSystemManager === 'function') {
    await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
      filePath: path,
      data: stamped.bytes.buffer.slice(stamped.bytes.byteOffset, stamped.bytes.byteOffset + stamped.bytes.byteLength),
      success: resolve,
      fail: reject
    }))
    return { path, manifest: stamped.manifest }
  }
  // #endif
  const url = URL.createObjectURL(new Blob([stamped.bytes]))
  return { path: url, manifest: stamped.manifest }
}

export { PRODUCT, VERSION }
