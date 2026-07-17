function ascii(value) {
  const output = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) output[index] = value.charCodeAt(index) & 0xff
  return output
}

function joinBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  parts.forEach((part) => {
    output.set(part, offset)
    offset += part.length
  })
  return output
}

function number(value) {
  return Number(value.toFixed(2)).toString()
}

export function jpegDimensions(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('PDF_EXPORT_INVALID_JPEG')
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
      return {
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4]
      }
    }
    offset += size
  }
  throw new Error('PDF_EXPORT_JPEG_SIZE_NOT_FOUND')
}

export function createJpegPdf(pages) {
  if (!pages?.length) throw new Error('PDF_EXPORT_NO_PAGES')
  const normalizedPages = pages.map((page) => {
    const bytes = page.bytes instanceof Uint8Array ? page.bytes : new Uint8Array(page.bytes)
    const size = jpegDimensions(bytes)
    const landscape = size.width > size.height
    const pageWidth = landscape ? 842 : 595
    const pageHeight = landscape ? 595 : 842
    const scale = Math.min(pageWidth / size.width, pageHeight / size.height)
    return {
      bytes,
      width: size.width,
      height: size.height,
      pageWidth,
      pageHeight,
      drawWidth: size.width * scale,
      drawHeight: size.height * scale
    }
  })

  const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const objects = []
  const pageObjectNumbers = normalizedPages.map((_, index) => 3 + index * 3)
  objects.push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'))
  objects.push(ascii(`2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((id) => `${id} 0 R`).join(' ')}] /Count ${normalizedPages.length} >>\nendobj\n`))

  normalizedPages.forEach((page, index) => {
    const pageId = pageObjectNumbers[index]
    const imageId = pageId + 1
    const contentId = pageId + 2
    const x = (page.pageWidth - page.drawWidth) / 2
    const y = (page.pageHeight - page.drawHeight) / 2
    const content = `q\n${number(page.drawWidth)} 0 0 ${number(page.drawHeight)} ${number(x)} ${number(y)} cm\n/Im${index + 1} Do\nQ\n`
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
  const body = objects.map((object) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`)
    offset += object.length
    return object
  })
  const xrefOffset = offset
  const trailer = ascii(`xref\n0 ${xref.length}\n${xref.join('')}trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
  return joinBytes([header, ...body, trailer])
}

export function readBinaryFile(path) {
  // #ifdef MP-WEIXIN
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      success: (result) => resolve(result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data)),
      fail: reject
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error(`PDF_EXPORT_READ_FAILED:${response.status}`)
    return response.arrayBuffer()
  }).then((data) => new Uint8Array(data))
  // #endif
}

export async function createJpegPdfFromPaths(paths) {
  const pages = await Promise.all(paths.map(async (path) => ({ bytes: await readBinaryFile(path) })))
  return createJpegPdf(pages)
}
