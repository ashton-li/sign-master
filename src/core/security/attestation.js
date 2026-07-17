import { compareBehaviorProfiles, extractBehaviorProfile } from './behavior'
import { constantTimeEqual, hmacSha256Hex, sha256Hex } from './hash'
import { getIdentity } from './identity'

function canonicalSnapshot(snapshot) {
  return JSON.stringify((snapshot?.strokes || []).map((stroke) => ({
    color: stroke.color,
    width: Number(stroke.width || 0),
    points: (stroke.points || []).map((point) => [Number(point.x.toFixed?.(2) ?? point.x), Number(point.y.toFixed?.(2) ?? point.y), Number((point.pressure ?? .5).toFixed?.(3) ?? point.pressure), Number(point.t || 0)])
  })))
}

function payloadOf(attestation) {
  return [attestation.version, attestation.ownerHash, attestation.createdAt, attestation.signatureHash, attestation.behaviorHash, attestation.nonce].join('|')
}

export function verifyAttestationEnvelope(attestation, identity = getIdentity()) {
  if (!attestation?.mac) return { valid: false, ownerMatch: false, reason: '缺少签字防伪签章' }
  const ownerMatch = attestation.ownerHash === sha256Hex(identity.id)
  const macValid = constantTimeEqual(attestation.mac, hmacSha256Hex(identity.secret, payloadOf(attestation)))
  return {
    valid: ownerMatch && macValid,
    ownerMatch,
    macValid,
    reason: ownerMatch && macValid ? '签字签章属于当前用户' : !ownerMatch ? '签字签章不属于当前用户' : '签字签章完整性校验失败'
  }
}

export function createAttestation(snapshot, identity = getIdentity(), createdAt = Date.now()) {
  const behaviorProfile = snapshot.behaviorProfile || extractBehaviorProfile(snapshot)
  const attestation = {
    version: 'SM1',
    ownerHash: sha256Hex(identity.id),
    createdAt,
    signatureHash: sha256Hex(canonicalSnapshot(snapshot)),
    behaviorHash: sha256Hex(JSON.stringify(behaviorProfile)),
    nonce: sha256Hex(`${createdAt}|${Math.random()}|${identity.id}`).slice(0, 20)
  }
  attestation.mac = hmacSha256Hex(identity.secret, payloadOf(attestation))
  return attestation
}

export function secureSnapshot(snapshot, identity = getIdentity(), force = false) {
  if (!snapshot) return snapshot
  const behaviorProfile = snapshot.behaviorProfile || extractBehaviorProfile(snapshot)
  const expectedOwner = sha256Hex(identity.id)
  const hasCurrentAttestation = !force && snapshot.attestation?.ownerHash === expectedOwner
  const next = { ...snapshot, behaviorProfile }
  return { ...next, attestation: hasCurrentAttestation ? snapshot.attestation : createAttestation(next, identity) }
}

export function verifyAttestation(snapshot, identity = getIdentity()) {
  const attestation = snapshot?.attestation
  if (!attestation) return { valid: false, ownerMatch: false, intact: false, reason: '没有防伪签章' }
  const behaviorProfile = snapshot.behaviorProfile || extractBehaviorProfile(snapshot)
  const signatureHash = sha256Hex(canonicalSnapshot(snapshot))
  const behaviorHash = sha256Hex(JSON.stringify(behaviorProfile))
  const mac = hmacSha256Hex(identity.secret, payloadOf(attestation))
  const ownerMatch = attestation.ownerHash === sha256Hex(identity.id)
  const intact = constantTimeEqual(signatureHash, attestation.signatureHash) && constantTimeEqual(behaviorHash, attestation.behaviorHash) && constantTimeEqual(mac, attestation.mac)
  return { valid: ownerMatch && intact, ownerMatch, intact, reason: ownerMatch && intact ? '来源签章有效' : !ownerMatch ? '签章不属于当前身份' : '签字数据已发生变化' }
}

export function verifyLiveSignature(referenceSnapshot, candidateSnapshot, identity = getIdentity()) {
  const provenance = verifyAttestation(referenceSnapshot, identity)
  const behavior = compareBehaviorProfiles(referenceSnapshot?.behaviorProfile || extractBehaviorProfile(referenceSnapshot), extractBehaviorProfile(candidateSnapshot))
  return { provenance, behavior, accepted: provenance.valid && behavior.score >= 58 }
}
