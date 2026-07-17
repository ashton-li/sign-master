import { ensureWriteCapacity, fileSize } from '../storage/capacity'

export function savePdfBytes(bytes, fileName, options = {}) {
  // #ifdef MP-WEIXIN
  return new Promise(async (resolve, reject) => {
    const fs = wx.getFileSystemManager()
    const category = ['documents', 'temporary'].includes(options.category) ? options.category : 'exports'
    const directory = `${wx.env.USER_DATA_PATH}/sign-master/${category}`
    const filePath = `${directory}/${fileName}`
    try {
      await ensureWriteCapacity(bytes.byteLength, { replacementBytes:fileSize(filePath, fs) })
    } catch (error) {
      reject(error)
      return
    }
    try { fs.accessSync(directory) } catch { fs.mkdirSync(directory, true) }
    fs.writeFile({
      filePath,
      data:bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      success:() => resolve(filePath),
      fail:reject
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  const blob = new Blob([bytes], { type:'application/pdf' })
  const url = URL.createObjectURL(blob)
  if (options.download !== false) {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return Promise.resolve(fileName)
  }
  return Promise.resolve(url)
  // #endif
}
