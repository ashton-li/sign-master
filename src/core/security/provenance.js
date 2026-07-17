import { createId, readLocal, writeLocal } from '../storage/localRepository'
import { constantTimeEqual, hmacSha256Hex, sha256Hex } from './hash'
import { getIdentity } from './identity'

function payload(record) {
  return JSON.stringify({
    id: record.id,
    documentId: record.documentId,
    fileName: record.fileName,
    format: record.format,
    createdAt: record.createdAt,
    ownerHash: record.ownerHash,
    signatures: record.signatures
  })
}

export function createProvenanceRecord(input, identity = getIdentity()) {
  const record = {
    id: createId('provenance'),
    documentId: input.documentId || '',
    fileName: input.fileName || '',
    path: input.path || '',
    format: input.format || '',
    createdAt: Date.now(),
    ownerHash: sha256Hex(identity.id),
    signatures: (input.layers || []).map((layer) => ({
      layerId: layer.id,
      slotId: layer.slotId,
      label: layer.label,
      signatureHash: layer.snapshot?.attestation?.signatureHash || '',
      attestation: layer.snapshot?.attestation?.mac || ''
    }))
  }
  record.mac = hmacSha256Hex(identity.secret, payload(record))
  return record
}

export function verifyProvenanceRecord(record, identity = getIdentity()) {
  if (!record?.mac) return false
  return record.ownerHash === sha256Hex(identity.id) && constantTimeEqual(record.mac, hmacSha256Hex(identity.secret, payload(record)))
}

export function saveProvenanceRecord(input, identity = getIdentity()) {
  const records = readLocal('security-records', [])
  const record = createProvenanceRecord(input, identity)
  writeLocal('security-records', [record, ...records].slice(0, 100))
  return record
}

export function getProvenanceRecords(identity = getIdentity()) {
  return readLocal('security-records', []).map((record) => ({ ...record, valid: verifyProvenanceRecord(record, identity) }))
}
