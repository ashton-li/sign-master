import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createId, readLocal, writeLocal } from '../core/storage/localRepository'
import { removeManagedFile } from '../core/file/sourcePicker'
import { secureSnapshot, verifyAttestation, verifyLiveSignature } from '../core/security/attestation'
import { getIdentity } from '../core/security/identity'
import { requestCollectionCapacity } from '../core/storage/collectionLimits'

const STORAGE_KEY = 'signatures'
export const SIGNATURE_LIMIT = 20

function migrateSignatures(stored) {
  return stored.map((item) => {
    const match = String(item.name || item.label || '').match(/^签名\s*(\d+)$/)
    const named = match ? { ...item, name: `我的签名${match[1]}`, label: `我的签名${match[1]}` } : item
    return named.snapshot ? { ...named, snapshot: secureSnapshot(named.snapshot) } : named
  }).slice(0, SIGNATURE_LIMIT)
}

export const useSignaturesStore = defineStore('signatures', () => {
  const stored = readLocal(STORAGE_KEY, [])
  const signatures = ref(migrateSignatures(stored))
  if (JSON.stringify(signatures.value) !== JSON.stringify(stored)) writeLocal(STORAGE_KEY, signatures.value)
  const defaultSignature = computed(() => signatures.value.find((item) => item.isDefault) || null)

  function requestCapacity(incomingCount = 1) {
    return requestCollectionCapacity({
      currentCount: signatures.value.length,
      incomingCount,
      limit: SIGNATURE_LIMIT,
      label: '我的签名',
      cleanupUrl: '/pages/signatures/index'
    })
  }

  function nextSignatureName() {
    const highest = signatures.value.reduce((max, item) => {
      const match = String(item.name || item.label || '').match(/(\d+)$/)
      return Math.max(max, Number(match?.[1] || 0))
    }, 0)
    return `\u6211\u7684\u7b7e\u540d${highest + 1}`
  }
  function addSignature(signature) {
    const generatedName = nextSignatureName()
    const item = {
      id: signature.id || createId('signature'),
      label: signature.label || generatedName,
      name: signature.name || signature.label || generatedName,
      createdAt: Date.now(),
      isDefault: signatures.value.length === 0,
      ...signature
    }
    if (item.snapshot) item.snapshot = secureSnapshot(item.snapshot)
    const next = [item, ...signatures.value.filter((entry) => entry.id !== item.id)]
    const removed = next.slice(SIGNATURE_LIMIT)
    signatures.value = next.slice(0, SIGNATURE_LIMIT)
    writeLocal(STORAGE_KEY, signatures.value)
    removed.forEach((entry) => {
      if (entry.snapshot?.pngPath && entry.snapshot.pngPath !== item.snapshot?.pngPath) removeManagedFile(entry.snapshot.pngPath, typeof uni !== 'undefined' ? uni : globalThis.uni)
    })
    return item
  }

  function setDefault(id) {
    signatures.value = signatures.value.map((item) => ({ ...item, isDefault: item.id === id }))
    writeLocal(STORAGE_KEY, signatures.value)
  }

  function removeSignature(id) {
    const target = signatures.value.find((item) => item.id === id)
    const wasDefault = target?.isDefault
    signatures.value = signatures.value.filter((item) => item.id !== id)
    if (wasDefault && signatures.value[0]) signatures.value[0].isDefault = true
    writeLocal(STORAGE_KEY, signatures.value)
    if (target?.snapshot?.pngPath) removeManagedFile(target.snapshot.pngPath, typeof uni !== 'undefined' ? uni : globalThis.uni)
  }

  function renameSignature(id, name) {
    const value = String(name || '').trim()
    if (!value) return false
    signatures.value = signatures.value.map((item) => item.id === id ? { ...item, name: value, label: value } : item)
    writeLocal(STORAGE_KEY, signatures.value)
    return true
  }

  function verifyStoredSignature(id) {
    const item = signatures.value.find((entry) => entry.id === id)
    return item?.snapshot ? verifyAttestation(item.snapshot) : { valid: false, ownerMatch: false, intact: false, reason: '签名不存在' }
  }

  function verifySignature(id, candidateSnapshot) {
    const item = signatures.value.find((entry) => entry.id === id)
    if (!item?.snapshot || !candidateSnapshot) return { accepted: false, provenance: verifyStoredSignature(id), behavior: { score: 0, verdict: '无法鉴别' } }
    return verifyLiveSignature(item.snapshot, candidateSnapshot)
  }

  function refreshSecurityIdentity(identity = getIdentity()) {
    signatures.value = signatures.value.map((item) => item.snapshot ? { ...item, snapshot: secureSnapshot(item.snapshot, identity) } : item)
    writeLocal(STORAGE_KEY, signatures.value)
  }

  function reload() {
    signatures.value = migrateSignatures(readLocal(STORAGE_KEY, []))
  }

  return {
    signatures,
    defaultSignature,
    requestCapacity,
    addSignature,
    setDefault,
    removeSignature,
    renameSignature,
    verifyStoredSignature,
    verifySignature,
    refreshSecurityIdentity,
    reload
  }
})
