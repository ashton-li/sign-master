import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAttestation, secureSnapshot, verifyAttestation, verifyLiveSignature } from '../../src/core/security/attestation'
import { compareBehaviorProfiles, extractBehaviorProfile } from '../../src/core/security/behavior'
import { hmacSha256Hex, sha256Hex } from '../../src/core/security/hash'
import { createProvenanceRecord, verifyProvenanceRecord } from '../../src/core/security/provenance'
import { embedDctWatermark, extractDctWatermark, systemWatermark, watermarkToken } from '../../src/core/security/watermark'
import { getIdentity, resetIdentityMemory } from '../../src/core/security/identity'

const identity = { id: 'sigpen_user_test', source: 'local-file', secret: 'local-secret-key' }

afterEach(() => {
  delete globalThis.uni
  delete globalThis.wx
  resetIdentityMemory()
})

function snapshot(offset = 0, duration = 100) {
  return {
    width: 300,
    height: 120,
    strokes: [{
      color: '#111111',
      width: 4,
      points: Array.from({ length: 24 }, (_, index) => ({
        x: index * 9 + offset,
        y: 55 + Math.sin(index / 3) * 24 + offset,
        pressure: .45 + (index % 5) * .05,
        t: index * duration / 23
      }))
    }]
  }
}

describe('security primitives', () => {
  it('matches SHA-256 and HMAC-SHA256 standard vectors', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog')).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })

  it('extracts a 128-dimensional profile and compares live behavior', () => {
    const reference = extractBehaviorProfile(snapshot())
    const similar = extractBehaviorProfile(snapshot(12, 112))
    const different = extractBehaviorProfile({ ...snapshot(), strokes: [{ ...snapshot().strokes[0], points: snapshot().strokes[0].points.map((point, index) => ({ ...point, y: index % 2 ? 4 : 108, t: index * 2 })) }] })

    expect(reference.vector).toHaveLength(128)
    expect(compareBehaviorProfiles(reference, similar).score).toBeGreaterThanOrEqual(78)
    expect(compareBehaviorProfiles(reference, different).score).toBeLessThan(compareBehaviorProfiles(reference, similar).score)
  })

  it('detects modified signature data and accepts a matching live sample', () => {
    const secured = secureSnapshot(snapshot(), identity)
    expect(verifyAttestation(secured, identity)).toMatchObject({ valid: true, ownerMatch: true, intact: true })
    expect(verifyLiveSignature(secured, snapshot(8, 108), identity).accepted).toBe(true)

    const modified = structuredClone(secured)
    modified.strokes[0].points[3].x += 40
    expect(verifyAttestation(modified, identity)).toMatchObject({ valid: false, intact: false })
  })

  it('binds attestations to the current owner identity', () => {
    const source = snapshot()
    source.behaviorProfile = extractBehaviorProfile(source)
    source.attestation = createAttestation(source, identity, 1234)
    expect(verifyAttestation(source, { ...identity, id: 'another-local-user' }).ownerMatch).toBe(false)
  })

  it('signs and verifies an export provenance record', () => {
    const record = createProvenanceRecord({ documentId:'doc-1', fileName:'contract.signed.pdf', format:'pdf', layers:[{ id:'layer-1', slotId:'slot-1', label:'签字', snapshot:secureSnapshot(snapshot(), identity) }] }, identity)
    expect(verifyProvenanceRecord(record, identity)).toBe(true)
    expect(verifyProvenanceRecord({ ...record, fileName:'modified.pdf' }, identity)).toBe(false)
  })

  it('embeds and extracts a blind DCT watermark after light pixel noise', () => {
    const width = 320
    const height = 240
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < width * height; index += 1) {
      const value = 205 + (index % 17)
      pixels[index * 4] = value; pixels[index * 4 + 1] = value - 3; pixels[index * 4 + 2] = value + 2; pixels[index * 4 + 3] = 255
    }
    const secured = secureSnapshot(snapshot(), identity)
    const token = watermarkToken(secured.attestation)
    const embedded = embedDctWatermark(pixels, width, height, token, identity.secret)
    const noisy = new Uint8ClampedArray(embedded.data)
    for (let index = 0; index < noisy.length; index += 97) if ((index + 1) % 4) noisy[index] = Math.max(0, Math.min(255, noisy[index] + (index % 2 ? 1 : -1)))
    const extracted = extractDctWatermark(noisy, width, height, token.length, identity.secret)

    expect(embedded.embedded).toBe(true)
    expect(extracted.token).toBe(token)
    expect(extracted.confidence).toBeGreaterThan(.8)
  })

  it('keeps system-origin and owner blind watermarks independently readable', () => {
    const width = 360
    const height = 280
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < width * height; index += 1) {
      const value = 190 + (index % 29)
      pixels[index * 4] = value
      pixels[index * 4 + 1] = value + 4
      pixels[index * 4 + 2] = value - 4
      pixels[index * 4 + 3] = 255
    }
    const system = systemWatermark()
    const ownerToken = watermarkToken(secureSnapshot(snapshot(), identity).attestation)
    const systemMarked = embedDctWatermark(pixels, width, height, system.token, system.key, system.options)
    const bothMarked = embedDctWatermark(systemMarked.data, width, height, ownerToken, identity.secret)
    const extractedSystem = extractDctWatermark(bothMarked.data, width, height, system.token.length, system.key, system.options)
    const extractedOwner = extractDctWatermark(bothMarked.data, width, height, ownerToken.length, identity.secret)

    expect(extractedSystem.token).toBe(system.token)
    expect(extractedOwner.token).toBe(ownerToken)
  })

  it('recovers the stable local user ID from USER_DATA_PATH after local state is cleared', () => {
    const storage = new Map()
    const files = new Map()
    const directories = new Set()
    globalThis.uni = {
      getStorageSync: vi.fn((key) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key, value) => storage.set(key, value)),
      removeStorageSync: vi.fn((key) => storage.delete(key))
    }
    globalThis.wx = {
      env: { USER_DATA_PATH: '/user' },
      getFileSystemManager: () => ({
        accessSync: (path) => { if (!directories.has(path) && !files.has(path)) throw new Error('missing') },
        mkdirSync: (path) => directories.add(path),
        writeFileSync: (path, value) => files.set(path, value),
        readFileSync: (path) => { if (!files.has(path)) throw new Error('missing'); return files.get(path) },
        renameSync: (source, target) => { files.set(target, files.get(source)); files.delete(source) },
        unlinkSync: (path) => files.delete(path)
      })
    }

    const first = getIdentity()
    storage.clear()
    files.delete('/user/sign-master/state/identity.json')
    resetIdentityMemory()
    const restored = getIdentity()

    expect(first.id).toMatch(/^sigpen_user_/)
    expect(restored.id).toBe(first.id)
    expect(restored.source).toBe('local-file')
    expect(files.get('/user/sign-master/user_id.txt')).toBe(first.id)
  })
})
