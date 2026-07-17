import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createId, readLocal, writeLocal } from '../core/storage/localRepository'
import { readFileProject, removeFileProject, writeFileProject } from '../core/storage/projectRepository'
import { removeManagedFile } from '../core/file/sourcePicker'
import { requestCollectionCapacity } from '../core/storage/collectionLimits'

const STORAGE_KEY = 'files'
export const SIGNED_FILE_LIMIT = 8

function documentKey(file) {
  const projectId = file?.projectRef || file?.project?.document?.id
  if (projectId) return `project:${projectId}`
  if (file?.sourceId) return `source:${file.sourceId}`
  if (file?.path) return `path:${file.path}`
  return `name:${file?.fileName || file?.name || ''}`
}

function compactRecord(file) {
  const project = file?.project
  const projectRef = file?.projectRef || project?.document?.id || file?.id || ''
  if (project && projectRef) writeFileProject(projectRef, project)
  const document = project?.document || {}
  const firstPage = document.pages?.[0] || {}
  const { project: _project, ...metadata } = file || {}
  return {
    ...metadata,
    projectRef,
    previewPath: metadata.thumbnail || metadata.previewPath || firstPage.previewPath || firstPage.path || document.previewPath || (document.kind === 'image' ? document.path : '') || ''
  }
}

function dedupeFiles(records = []) {
  const seen = new Set()
  return records.filter((file) => {
    const key = documentKey(file)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const useFilesStore = defineStore('files', () => {
  const stored = dedupeFiles(readLocal(STORAGE_KEY, []))
  const migrated = stored.slice(0, SIGNED_FILE_LIMIT).map(compactRecord)
  const files = ref(migrated)
  if (stored.some((item) => item.project) || stored.length !== migrated.length) writeLocal(STORAGE_KEY, migrated)
  const count = computed(() => files.value.length)

  function persist() { writeLocal(STORAGE_KEY, files.value) }

  function requestCapacity(file) {
    const replacing = files.value.some((item) => documentKey(item) === documentKey(file))
    return requestCollectionCapacity({
      currentCount: files.value.length,
      incomingCount: replacing ? 0 : 1,
      limit: SIGNED_FILE_LIMIT,
      label: '已签署文件',
      cleanupUrl: '/pages/home/index'
    })
  }

  function addSignedFile(file) {
    const key = documentKey(file)
    const previous = files.value.find((item) => documentKey(item) === key)
    const record = compactRecord({
      id: previous?.id || createId('file'),
      date: new Date().toLocaleString('zh-CN', { hour12: false }),
      status: '已签署',
      signatures: 0,
      icon: file.kind === 'image' ? 'scan' : 'document',
      active: true,
      ...file
    })
    const next = [record, ...files.value.filter((item) => documentKey(item) !== key)]
    const removed = next.slice(SIGNED_FILE_LIMIT)
    files.value = next.slice(0, SIGNED_FILE_LIMIT).map((item, index) => ({ ...item, active: index === 0 }))
    persist()
    if (previous?.path && previous.path !== record.path) removeManagedFile(previous.path, typeof uni !== 'undefined' ? uni : globalThis.uni)
    if (previous?.thumbnail && previous.thumbnail !== record.thumbnail && previous.thumbnail !== previous.path) removeManagedFile(previous.thumbnail, typeof uni !== 'undefined' ? uni : globalThis.uni)
    removed.forEach((item) => {
      if (item.path && item.path !== record.path) removeManagedFile(item.path, typeof uni !== 'undefined' ? uni : globalThis.uni)
      if (item.thumbnail && item.thumbnail !== item.path && item.thumbnail !== record.thumbnail) removeManagedFile(item.thumbnail, typeof uni !== 'undefined' ? uni : globalThis.uni)
      removeFileProject(item.projectRef)
    })
    return record
  }

  function removeFile(id) {
    const target = files.value.find((item) => item.id === id)
    files.value = files.value.filter((item) => item.id !== id)
    persist()
    if (target?.path) removeManagedFile(target.path, typeof uni !== 'undefined' ? uni : globalThis.uni)
    if (target?.thumbnail && target.thumbnail !== target.path) removeManagedFile(target.thumbnail, typeof uni !== 'undefined' ? uni : globalThis.uni)
    removeFileProject(target?.projectRef)
  }

  function getFile(id) { return files.value.find((item) => item.id === id) || null }

  function getProject(fileOrId) {
    const file = typeof fileOrId === 'string' ? getFile(fileOrId) : fileOrId
    return file?.project || readFileProject(file?.projectRef)
  }

  function reload() {
    files.value = dedupeFiles(readLocal(STORAGE_KEY, [])).slice(0, SIGNED_FILE_LIMIT).map(compactRecord)
    persist()
  }

  return { files, count, requestCapacity, addSignedFile, removeFile, getFile, getProject, reload }
})
