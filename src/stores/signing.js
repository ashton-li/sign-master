import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { buildExportManifest, createMinimalPdf } from '../core/export/exporter'
import { createLayer } from '../core/layers/layerEngine'
import { createSignatureSnapshotFromStrokes } from '../core/signature/path'
import { createId, readLocal, removeLocal, writeLocal } from '../core/storage/localRepository'
import { secureSnapshot } from '../core/security/attestation'
import { detectSignatureSlots } from '../core/vision/slotDetector'

const DRAFT_KEY = 'active-project'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function blankProject() {
  return {
    document: null,
    slots: [],
    activeSlotId: '',
    signature: null,
    layers: [],
    selectedLayerId: '',
    exportFormat: 'jpg',
    appliedTemplateId: ''
  }
}

export const useSigningStore = defineStore('signing', () => {
  const saved = readLocal(DRAFT_KEY, blankProject())
  const document = ref(saved.document || null)
  const slots = ref(saved.slots || [])
  const activeSlotId = ref(saved.activeSlotId || '')
  const signature = ref(saved.signature || null)
  const layers = ref(saved.layers || [])
  const selectedLayerId = ref(saved.selectedLayerId || '')
  const exportFormat = ref(saved.exportFormat || 'jpg')
  const appliedTemplateId = ref(saved.appliedTemplateId || '')
  const exportManifest = ref(null)
  const pdfPayload = ref('')
  const undoStack = ref([])
  const redoStack = ref([])

  const activeSlot = computed(() => slots.value.find((slot) => slot.id === activeSlotId.value) || null)
  const selectedLayer = computed(() => layers.value.find((layer) => layer.id === selectedLayerId.value) || null)
  const hasProject = computed(() => Boolean(document.value?.path))

  function persist() {
    writeLocal(DRAFT_KEY, {
      document: document.value,
      slots: slots.value,
      activeSlotId: activeSlotId.value,
      signature: signature.value,
      layers: layers.value,
      selectedLayerId: selectedLayerId.value,
      exportFormat: exportFormat.value,
      appliedTemplateId: appliedTemplateId.value
    })
  }

  function snapshotLayers() {
    undoStack.value.push(clone(layers.value))
    if (undoStack.value.length > 80) undoStack.value.shift()
    redoStack.value = []
  }

  function resetFlow(options = {}) {
    const next = blankProject()
    document.value = next.document
    slots.value = options.template?.positions ? clone(options.template.positions) : []
    activeSlotId.value = slots.value[0]?.id || ''
    signature.value = null
    layers.value = []
    selectedLayerId.value = ''
    exportFormat.value = 'jpg'
    appliedTemplateId.value = options.template?.id || ''
    undoStack.value = []
    redoStack.value = []
    exportManifest.value = null
    pdfPayload.value = ''
    removeLocal(DRAFT_KEY)
    if (options.template) persist()
  }

  function setPickedFile(file) {
    document.value = {
      id: file.id || createId('document'),
      name: file.name,
      path: file.path,
      originalPath: file.originalPath || '',
      previewPath: file.previewPath || '',
      correctedPreviewPath: file.correctedPreviewPath || '',
      kind: file.kind,
      extension: file.extension,
      source: file.source,
      storageCategory: file.storageCategory || '',
      size: file.size || 0,
      page: 1,
      totalPages: file.totalPages || 1,
      pages: (file.pages || []).map((page) => ({ id:page.id || '', name: page.name, path: page.path, originalPath: page.originalPath || '', previewPath: page.previewPath || '', correctedPreviewPath: page.correctedPreviewPath || '', kind: page.kind, extension: page.extension, storageCategory:page.storageCategory || file.storageCategory || '', width: page.width, height: page.height, scanBounds: page.scanBounds || null })),
      width: file.width || 750,
      height: file.height || 1000,
      textLines: file.textLines || [],
      scanBounds: file.scanBounds || null,
      scanPdfPath: file.scanPdfPath || '',
      scanPdfName: file.scanPdfName || '',
      detectedSlots: clone(file.detectedSlots || [])
    }
    if (!appliedTemplateId.value) slots.value = file.detectedSlots?.length ? clone(file.detectedSlots) : detectSignatureSlots(document.value)
    activeSlotId.value = slots.value[0]?.id || ''
    exportFormat.value = file.kind === 'pdf' || (file.totalPages || 1) > 1 ? 'pdf' : 'jpg'
    persist()
  }

  function replaceDocumentFiles(file) {
    if (!document.value || !file?.path) return false
    document.value = {
      ...document.value,
      path:file.path,
      originalPath:file.originalPath || document.value.originalPath || '',
      previewPath:file.previewPath || document.value.previewPath || '',
      correctedPreviewPath:file.correctedPreviewPath || document.value.correctedPreviewPath || '',
      storageCategory:file.storageCategory || 'documents',
      pages:(file.pages || document.value.pages || []).map((page, index) => ({
        ...(document.value.pages?.[index] || {}),
        ...page
      })),
      scanPdfPath:file.scanPdfPath || document.value.scanPdfPath || ''
    }
    persist()
    return true
  }

  function loadProject(project) {
    if (!project?.document) return false
    document.value = clone(project.document)
    slots.value = clone(project.slots || [])
    activeSlotId.value = slots.value[0]?.id || ''
    signature.value = clone(project.signature || null)
    layers.value = clone(project.layers || [])
    selectedLayerId.value = layers.value[0]?.id || ''
    appliedTemplateId.value = project.appliedTemplateId || ''
    undoStack.value = []
    redoStack.value = []
    persist()
    return true
  }

  function getProjectSnapshot() {
    return clone({ document: document.value, slots: slots.value, signature: signature.value, layers: layers.value, appliedTemplateId: appliedTemplateId.value })
  }

  function runDetection() {
    if (!document.value || appliedTemplateId.value) return slots.value
    slots.value = document.value.detectedSlots?.length
      ? clone(document.value.detectedSlots)
      : detectSignatureSlots(document.value)
    activeSlotId.value = slots.value[0]?.id || ''
    persist()
    return slots.value
  }

  function addManualSlot(input = {}) {
    const slot = {
      id: createId('slot'),
      label: input.label || `签字位${slots.value.length + 1}`,
      x: input.x ?? 0.34,
      y: input.y ?? 0.68,
      width: input.width ?? 0.32,
      height: input.height ?? 0.08,
      confidence: 1,
      source: 'manual',
      page: input.page || document.value?.page || 1
    }
    slots.value.push(slot)
    activeSlotId.value = slot.id
    persist()
    return slot
  }

  function selectSlot(slotId) {
    activeSlotId.value = slotId
    persist()
  }

  function setDocumentPage(page) {
    if (!document.value) return
    document.value.page = Math.max(1, Math.min(document.value.totalPages || 1, page))
    persist()
  }

  function saveSignature(strokes, options = {}) {
    signature.value = secureSnapshot(createSignatureSnapshotFromStrokes(strokes, {
      width: options.width || 900,
      height: options.height || 500,
      color: options.color || '#1a1c26',
      strokeWidth: options.strokeWidth || 4,
      pngPath: options.pngPath || ''
    }))
    addSignatureLayer(signature.value)
    persist()
    return signature.value
  }

  function useSavedSignature(savedSignature) {
    signature.value = clone(secureSnapshot(savedSignature))
    addSignatureLayer(signature.value)
    persist()
  }

  function addSignatureLayer(snapshot) {
    const slot = activeSlot.value || addManualSlot()
    const layer = createLayerFromSlot(snapshot, slot)
    snapshotLayers()
    const existingIndex = layers.value.findIndex((item) => item.slotId === slot.id)
    if (existingIndex >= 0) {
      layer.id = layers.value[existingIndex].id
      layers.value.splice(existingIndex, 1, layer)
    } else {
      layers.value.push(layer)
    }
    selectedLayerId.value = layer.id
  }

  function createLayerFromSlot(snapshot, slot) {
    const x = Math.max(0, Math.min(329, Math.round(slot.x * 330)))
    const y = Math.max(0, Math.min(499, Math.round(slot.y * 500)))
    const width = Math.max(1, Math.min(330 - x, Math.max(72, Math.round(slot.width * 330))))
    const height = Math.max(1, Math.min(500 - y, Math.max(24, Math.round(slot.height * 500))))
    return createLayer({
      id: createId('layer'),
      slotId: slot.id,
      type: 'signature',
      label: slot.label,
      page: slot.page || document.value?.page || 1,
      snapshot: clone(snapshot),
      x,
      y,
      width,
      height,
      rotation: slot.rotation || 0,
      opacity: slot.opacity ?? 1,
      color: snapshot.color || '#1a1c26'
    })
  }

  function applyTemplateSignatures(assignments, signatureItems) {
    if (!document.value || !slots.value.length) return false
    const signatureMap = new Map((signatureItems || []).map((item) => [item.id, item]))
    const nextLayers = []
    for (const slot of slots.value) {
      const item = signatureMap.get(assignments?.[slot.id])
      if (!item?.snapshot) return false
      nextLayers.push(createLayerFromSlot(item.snapshot, slot))
    }
    snapshotLayers()
    layers.value = nextLayers
    signature.value = clone(signatureMap.get(assignments?.[slots.value[0].id])?.snapshot || null)
    selectedLayerId.value = layers.value[0]?.id || ''
    persist()
    return true
  }

  function updateSelectedLayer(patch, options = {}) {
    const index = layers.value.findIndex((layer) => layer.id === selectedLayerId.value)
    if (index < 0 || layers.value[index].locked) return null
    if (!options.transient) snapshotLayers()
    layers.value[index] = { ...layers.value[index], ...patch }
    if (!options.transient) persist()
    return layers.value[index]
  }

  function commitTransientChange(beforeLayers) {
    if (!beforeLayers) return
    undoStack.value.push(clone(beforeLayers))
    redoStack.value = []
    persist()
  }

  function selectLayer(layerId) {
    selectedLayerId.value = layerId
  }

  function rotateSelectedLayer(delta = 15) {
    const layer = selectedLayer.value
    if (layer) updateSelectedLayer({ rotation: (layer.rotation || 0) + delta })
  }

  function toggleSelectedLock() {
    const index = layers.value.findIndex((layer) => layer.id === selectedLayerId.value)
    if (index < 0) return
    snapshotLayers()
    layers.value[index] = { ...layers.value[index], locked: !layers.value[index].locked }
    persist()
  }

  function deleteSelectedLayer() {
    const index = layers.value.findIndex((layer) => layer.id === selectedLayerId.value)
    if (index < 0) return
    snapshotLayers()
    layers.value.splice(index, 1)
    selectedLayerId.value = layers.value[0]?.id || ''
    persist()
  }

  function undoLayers() {
    if (!undoStack.value.length) return false
    redoStack.value.push(clone(layers.value))
    layers.value = undoStack.value.pop()
    selectedLayerId.value = layers.value.at(-1)?.id || ''
    persist()
    return true
  }

  function redoLayers() {
    if (!redoStack.value.length) return false
    undoStack.value.push(clone(layers.value))
    layers.value = redoStack.value.pop()
    selectedLayerId.value = layers.value.at(-1)?.id || ''
    persist()
    return true
  }

  function saveDraft() {
    persist()
    return true
  }

  function buildExport(format = exportFormat.value) {
    if (!document.value || !layers.value.length) throw new Error('签署工程不完整')
    exportFormat.value = format
    exportManifest.value = buildExportManifest({ fileName: document.value.name, format, layers: layers.value })
    pdfPayload.value = createMinimalPdf({ title: document.value.name, layers: layers.value })
    persist()
    return exportManifest.value
  }

  return {
    document, slots, activeSlotId, activeSlot, signature, layers, selectedLayerId, selectedLayer,
    exportFormat, exportManifest, pdfPayload, appliedTemplateId, hasProject, undoStack, redoStack,
    resetFlow, setPickedFile, replaceDocumentFiles, loadProject, getProjectSnapshot, runDetection, addManualSlot, selectSlot, setDocumentPage, saveSignature, useSavedSignature, applyTemplateSignatures,
    updateSelectedLayer, commitTransientChange, selectLayer, rotateSelectedLayer, toggleSelectedLock,
    deleteSelectedLayer, undoLayers, redoLayers, saveDraft, buildExport
  }
})
