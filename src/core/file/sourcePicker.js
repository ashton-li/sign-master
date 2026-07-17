import { ensureWriteCapacity, fileSize } from '../storage/capacity'

const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp']

function extensionOf(name = '') {
  return name.split('.').pop()?.toLowerCase() || ''
}

function normalizeFile(first, source, fallbackName) {
  const path = first?.path || first?.tempFilePath || ''
  const name = first?.name || fallbackName
  const extension = extensionOf(name) || extensionOf(path)
  return {
    id: `picked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    path,
    size: first?.size || 0,
    source,
    extension,
    kind: extension === 'pdf' ? 'pdf' : 'image',
    importedAt: Date.now()
  }
}

function chooseImage(uniApi, source) {
  return new Promise((resolve, reject) => {
    if (typeof uniApi?.chooseImage !== 'function') {
      chooseBrowserFile(source, 'image/*', source !== 'album').then(resolve, reject)
      return
    }
    uniApi.chooseImage({
      count: source === 'album' ? 9 : 1,
      sourceType: [source === 'album' ? 'album' : 'camera'],
      sizeType: ['original'],
      success(result) {
        const tempFiles = result?.tempFiles?.length
          ? result.tempFiles
          : (result?.tempFilePaths || []).map((path) => ({ path }))
        if (!tempFiles.length) {
          reject(new Error('cancel'))
          return
        }
        const files = tempFiles.map((item, index) => normalizeFile(item, source, source === 'scan' ? `扫描文稿${index + 1}.jpg` : source === 'album' ? `相册图片${index + 1}.jpg` : '拍摄文件.jpg'))
        if (!files[0]?.path) {
          reject(new Error('cancel'))
          return
        }
        resolve({ ...files[0], pages: files, totalPages: files.length })
      },
      fail: reject
    })
  })
}

function chooseBrowserFile(source, accept, capture = false) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('当前平台不支持文件选择'))
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = source === 'album'
    if (capture) input.setAttribute('capture', 'environment')
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      const selected = input.files?.[0]
      if (!selected) return reject(new Error('cancel'))
      const files = Array.from(input.files || []).map((entry) => normalizeFile({ name: entry.name, path: URL.createObjectURL(entry), size: entry.size }, source, entry.name))
      input.remove()
      resolve({ ...files[0], pages: files, totalPages: files.length })
    }
    input.oncancel = () => { input.remove(); reject(new Error('cancel')) }
    input.click()
  })
}

function chooseMessageFile(uniApi) {
  return new Promise((resolve, reject) => {
    if (typeof uniApi?.chooseMessageFile !== 'function') return reject(new Error('当前平台不支持微信文件'))
    uniApi.chooseMessageFile({
      count: 1,
      type: 'all',
      success(result) {
        const selected = result?.tempFiles?.[0]
        if (!selected?.path && !selected?.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        const file = normalizeFile(selected, 'wechat', '微信文件.pdf')
        if (!ACCEPTED_EXTENSIONS.includes(file.extension)) {
          reject(new Error('仅支持 PDF、PNG、JPG、JPEG、WEBP、BMP'))
          return
        }
        resolve(file)
      },
      fail: reject
    })
  })
}

function chooseH5File(uniApi, source) {
  return new Promise((resolve, reject) => {
    if (typeof uniApi?.chooseFile !== 'function') {
      chooseBrowserFile(source, ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(','), false).then(resolve, reject)
      return
    }
    uniApi.chooseFile({
      count: 1,
      extension: ACCEPTED_EXTENSIONS,
      success(result) {
        const file = normalizeFile(result?.tempFiles?.[0], source, '导入文件.pdf')
        if (!ACCEPTED_EXTENSIONS.includes(file.extension)) return reject(new Error('文件格式不支持'))
        resolve(file)
      },
      fail: reject
    })
  })
}

function managedFileSystem() {
  try {
    if (typeof wx !== 'undefined' && wx?.env?.USER_DATA_PATH && typeof wx.getFileSystemManager === 'function') {
      return { fs: wx.getFileSystemManager(), root: `${wx.env.USER_DATA_PATH}/sign-master` }
    }
  } catch {}
  return null
}

function safeFilePart(value, fallback = 'file') {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function ensureManagedDirectory(fs, directory) {
  try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
}

export async function persistLocalFile(file, uniApi = globalThis.uni, options = {}) {
  if (!file?.path) return Promise.resolve(file)
  const managed = managedFileSystem()
  if (managed) {
    const category = safeFilePart(options.category || 'documents')
    const extension = safeFilePart(file.extension || extensionOf(file.name) || 'bin')
    const id = safeFilePart(options.id || file.id || `file-${Date.now()}`)
    const directory = `${managed.root}/${category}`
    const targetPath = `${directory}/${id}.${extension}`
    if (file.path === targetPath) return { ...file, path: targetPath, persistent: true, managed: true, storageCategory: category }
    const sourceBytes = Number(file.size || fileSize(file.path, managed.fs))
    await ensureWriteCapacity(sourceBytes, { uniApi, replacementBytes: fileSize(targetPath, managed.fs), category })
    return new Promise((resolve, reject) => {
      try {
        ensureManagedDirectory(managed.fs, directory)
        managed.fs.copyFile({
          srcPath: file.path,
          destPath: targetPath,
          success: () => resolve({ ...file, path: targetPath, originalPath: file.originalPath || file.path, persistent: true, managed: true, storageCategory: category }),
          fail: (error) => reject(new Error(error?.errMsg || '文件保存失败，请检查本机可用空间后重试。'))
        })
      } catch (error) {
        reject(error)
      }
    })
  }
  if (typeof uniApi?.saveFile !== 'function') return file
  return new Promise((resolve) => {
    uniApi.saveFile({
      tempFilePath: file.path,
      success: (result) => resolve({ ...file, path: result.savedFilePath || file.path, persistent: true }),
      fail: () => resolve(file)
    })
  })
}

export function removeManagedFile(filePath, uniApi = globalThis.uni) {
  if (!filePath) return
  const managed = managedFileSystem()
  if (managed && filePath.startsWith(`${managed.root}/`)) {
    try { managed.fs.unlinkSync(filePath) } catch {}
    return
  }
  if (typeof uniApi?.removeSavedFile === 'function') uniApi.removeSavedFile({ filePath, fail: () => {} })
}

export async function persistDocumentFiles(file, uniApi = globalThis.uni, options = {}) {
  const sourcePages = file?.pages?.length ? file.pages : []
  const category = options.category || 'documents'
  const managed = managedFileSystem()
  if (managed && sourcePages.length > 1) {
    const totalBytes = sourcePages.reduce((sum, page) => sum + Number(page.size || fileSize(page.path, managed.fs)), 0)
    await ensureWriteCapacity(totalBytes, { uniApi, category })
  }
  const pages = sourcePages.length
    ? await Promise.all(sourcePages.map((page, index) => persistLocalFile({
      ...page,
      id:page.id || `${file.id || 'document'}-page-${index + 1}`
    }, uniApi, { category })))
    : []
  const primary = pages[0] || await persistLocalFile(file, uniApi, { category })
  return { ...file, ...primary, pages, totalPages: pages.length || file.totalPages || 1 }
}

export async function promoteDocumentFiles(file, uniApi = globalThis.uni) {
  const isTemporary = file?.storageCategory === 'temporary' || String(file?.path || '').includes('/sign-master/temporary/')
  if (!file?.path || !isTemporary) return file
  const temporaryPaths = [...new Set([file.path, file.scanPdfPath, ...(file.pages || []).map((page) => page.path)].filter(Boolean))]
  let promoted = await persistDocumentFiles(file, uniApi, { category: 'documents' })
  if (file.scanPdfPath && String(file.scanPdfPath).includes('/sign-master/temporary/')) {
    const scanPdf = await persistLocalFile({
      id:`${file.id || 'scan'}-source-pdf`,
      name:file.scanPdfName || '扫描文稿.pdf',
      path:file.scanPdfPath,
      kind:'pdf',
      extension:'pdf'
    }, uniApi, { category:'documents' })
    promoted = { ...promoted, scanPdfPath:scanPdf.path }
  }
  temporaryPaths.forEach((path) => removeManagedFile(path, uniApi))
  return promoted
}

export function discardTemporaryDocument(file, uniApi = globalThis.uni) {
  if (!file) return
  const candidates = [file, ...(file.pages || []), file.scanPdfPath ? { path:file.scanPdfPath } : null]
  candidates.forEach((entry) => {
    if (entry?.storageCategory === 'temporary' || String(entry?.path || '').includes('/sign-master/temporary/')) removeManagedFile(entry.path, uniApi)
  })
}

export function pickDocumentSource(source, options = {}) {
  const uniApi = options.uniApi || globalThis.uni
  if (source === 'camera' || source === 'album' || source === 'scan') return chooseImage(uniApi, source).then((file) => options.persist === false ? file : persistDocumentFiles(file, uniApi))
  if (source === 'wechat') {
    if (typeof uniApi?.chooseMessageFile === 'function') return chooseMessageFile(uniApi).then((file) => options.persist === false ? file : persistLocalFile(file, uniApi))
    return chooseH5File(uniApi, source).then((file) => options.persist === false ? file : persistLocalFile(file, uniApi))
  }
  return Promise.reject(new Error(`不支持的文件来源：${source}`))
}

export { ACCEPTED_EXTENSIONS, extensionOf }
