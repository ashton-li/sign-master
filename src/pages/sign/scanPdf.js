function ascii(value) {
  const output = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) output[index] = value.charCodeAt(index) & 0xff
  return output
}

function joinBytes(parts) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function pdfNumber(value) {
  return Number(value.toFixed(2)).toString()
}

function jpegDimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('扫描页不是有效的 JPEG 图片')
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 1 >= bytes.length) break
    const size = (bytes[offset] << 8) | bytes[offset + 1]
    if (size < 2 || offset + size > bytes.length) break
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width:(bytes[offset + 5] << 8) | bytes[offset + 6], height:(bytes[offset + 3] << 8) | bytes[offset + 4] }
    }
    offset += size
  }
  throw new Error('无法读取扫描页尺寸')
}

function createPdf(pages) {
  if (!pages.length) throw new Error('扫描页为空')
  const normalized = pages.map((bytes) => {
    const size = jpegDimensions(bytes)
    const landscape = size.width > size.height
    const pageWidth = landscape ? 842 : 595
    const pageHeight = landscape ? 595 : 842
    const scale = Math.min(pageWidth / size.width, pageHeight / size.height)
    return { bytes, ...size, pageWidth, pageHeight, drawWidth:size.width * scale, drawHeight:size.height * scale }
  })
  const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const objects = []
  const pageIds = normalized.map((_, index) => 3 + index * 3)
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'))
  objects.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${normalized.length} >>\nendobj\n`))
  normalized.forEach((page, index) => {
    const pageId = pageIds[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    const x = (page.pageWidth - page.drawWidth) / 2
    const y = (page.pageHeight - page.drawHeight) / 2
    const content = `q\n${pdfNumber(page.drawWidth)} 0 0 ${pdfNumber(page.drawHeight)} ${pdfNumber(x)} ${pdfNumber(y)} cm\n/Im${index + 1} Do\nQ\n`
    objects.push(ascii(`${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`))
    objects.push(joinBytes([
      ascii(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`),
      page.bytes,
      ascii('\nendstream\nendobj\n')
    ]))
    objects.push(ascii(`${contentId} 0 obj\n<< /Length ${ascii(content).length} >>\nstream\n${content}endstream\nendobj\n`))
  })
  let offset = header.length
  const xref = ['0000000000 65535 f \n']
  objects.forEach((object) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
    offset += object.length
  })
  return joinBytes([header, ...objects, ascii(`xref\n0 ${xref.length}\n${xref.join('')}trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`)])
}

function readJpeg(path) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath:path,
      success:({ data }) => resolve(data instanceof Uint8Array ? data : new Uint8Array(data)),
      fail:reject
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error(`无法读取扫描页：${response.status}`)
    return response.arrayBuffer()
  }).then((data) => new Uint8Array(data))
  // #endif
}

export async function createScanPdfFromPaths(paths) {
  const pages = []
  for (const path of paths) pages.push(await readJpeg(path))
  return createPdf(pages)
}
