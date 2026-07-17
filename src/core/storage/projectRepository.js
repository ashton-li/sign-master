import { assertWriteCapacity, fileSize, StorageCapacityError, utf8ByteLength } from './capacity'

const PREFIX = 'sign-master:file-project:'
const memoryProjects = new Map()

function safeId(value) {
  return String(value || 'project').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96)
}

function projectFile(id) {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      const directory = `${wx.env.USER_DATA_PATH}/sign-master/projects`
      return { fs: wx.getFileSystemManager(), directory, path: `${directory}/${safeId(id)}.json` }
    }
  } catch {
    // Browser and unit-test runtimes use localStorage or memory.
  }
  return null
}

export function writeFileProject(id, project) {
  if (!id || !project) return ''
  const key = safeId(id)
  const target = projectFile(key)
  if (target) {
    try {
      try { target.fs.accessSync(target.directory) } catch { target.fs.mkdirSync(target.directory, true) }
      const temporary = `${target.path}.tmp`
      const text = JSON.stringify(project)
      assertWriteCapacity(utf8ByteLength(text), { replacementBytes: fileSize(target.path, target.fs) })
      target.fs.writeFileSync(temporary, text, 'utf8')
      try { target.fs.renameSync(temporary, target.path) } catch { target.fs.writeFileSync(target.path, text, 'utf8') }
      return key
    } catch (error) {
      if (error instanceof StorageCapacityError) throw error
      // Fall back to storage below.
    }
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(project))
    else memoryProjects.set(key, project)
  } catch {
    memoryProjects.set(key, project)
  }
  return key
}

export function readFileProject(id) {
  if (!id) return null
  const key = safeId(id)
  const target = projectFile(key)
  if (target) {
    try { return JSON.parse(String(target.fs.readFileSync(target.path, 'utf8'))) } catch {}
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const text = localStorage.getItem(`${PREFIX}${key}`)
      return text ? JSON.parse(text) : null
    }
  } catch {}
  return memoryProjects.get(key) || null
}

export function removeFileProject(id) {
  if (!id) return
  const key = safeId(id)
  const target = projectFile(key)
  if (target) {
    try { target.fs.unlinkSync(target.path) } catch {}
  }
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(`${PREFIX}${key}`) } catch {}
  memoryProjects.delete(key)
}
