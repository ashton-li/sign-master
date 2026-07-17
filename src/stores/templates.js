import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createId, readLocal, writeLocal } from '../core/storage/localRepository'
import { requestCollectionCapacity } from '../core/storage/collectionLimits'

const STORAGE_KEY = 'templates'
export const TEMPLATE_LIMIT = 10

export const useTemplatesStore = defineStore('templates', () => {
  const stored = readLocal(STORAGE_KEY, [])
  const templates = ref(stored.slice(0, TEMPLATE_LIMIT))
  if (templates.value.length < stored.length) writeLocal(STORAGE_KEY, templates.value)
  const count = computed(() => templates.value.length)

  function requestCapacity(input = {}) {
    const replacing = Boolean(input.id && templates.value.some((item) => item.id === input.id))
    return requestCollectionCapacity({
      currentCount: templates.value.length,
      incomingCount: replacing ? 0 : 1,
      limit: TEMPLATE_LIMIT,
      label: '我的模板',
      cleanupUrl: '/pages/templates/index'
    })
  }

  function saveTemplate(input) {
    const item = {
      id: input.id || createId('template'),
      name: input.name || '未命名模板',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      positions: (input.positions || []).map((slot) => ({ ...slot })),
      ...input
    }
    item.slots = item.positions.length
    templates.value = [item, ...templates.value.filter((entry) => entry.id !== item.id)].slice(0, TEMPLATE_LIMIT)
    writeLocal(STORAGE_KEY, templates.value)
    return item
  }

  function removeTemplate(id) {
    templates.value = templates.value.filter((item) => item.id !== id)
    writeLocal(STORAGE_KEY, templates.value)
  }

  function renameTemplate(id, name) {
    const value = String(name || '').trim()
    if (!value) return false
    templates.value = templates.value.map((item) => item.id === id ? { ...item, name: value, updatedAt: Date.now() } : item)
    writeLocal(STORAGE_KEY, templates.value)
    return true
  }

  function getTemplate(id) {
    return templates.value.find((item) => item.id === id) || null
  }

  function reload() {
    templates.value = readLocal(STORAGE_KEY, []).slice(0, TEMPLATE_LIMIT)
  }

  return {
    templates,
    count,
    requestCapacity,
    saveTemplate,
    removeTemplate,
    renameTemplate,
    getTemplate,
    reload
  }
})
