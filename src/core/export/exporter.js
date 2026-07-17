function sanitizeBaseName(fileName) {
  const withoutExt = String(fileName || '签署文件').replace(/\.[^.]+$/, '')
  return withoutExt
    .replace(/\.+/g, '_')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || '签署文件'
}

function localTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function normalizeFormat(format) {
  return ['pdf', 'png', 'jpg', 'jpeg'].includes(format) ? format : 'pdf'
}

export function buildExportManifest(input) {
  const format = normalizeFormat(input?.format)
  const createdAt = new Date()
  const baseName = sanitizeBaseName(input?.fileName)
  return {
    mode: 'offline',
    createdAt: createdAt.toISOString(),
    fileName: `${baseName}_已签署_${localTimestamp(createdAt)}.${format === 'jpeg' ? 'jpg' : format}`,
    sourceFileName: input?.fileName || '',
    format,
    layerCount: input?.layers?.length || 0,
    requiresNetwork: false
  }
}

export function createMinimalPdf(input = {}) {
  const title = input.title || 'SignMaster Export'
  const signatures = input.signatures || []
  const signatureText = signatures.map((item) => `${item.label} @ ${item.x},${item.y}`).join(' | ')
  const content = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    `(${title}) Tj`,
    '0 -32 Td',
    '/F1 12 Tf',
    `(Signatures: ${signatureText || 'none'}) Tj`,
    'ET'
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`
  ]

  let cursor = '%PDF-1.4\n'.length
  const xref = ['0000000000 65535 f ']
  const body = objects
    .map((object) => {
      xref.push(`${String(cursor).padStart(10, '0')} 00000 n `)
      cursor += object.length + 1
      return object
    })
    .join('\n')
  const xrefStart = '%PDF-1.4\n'.length + body.length + 1

  return [
    '%PDF-1.4',
    body,
    'xref',
    `0 ${xref.length}`,
    ...xref,
    'trailer',
    `<< /Size ${xref.length} /Root 1 0 R >>`,
    'startxref',
    String(xrefStart),
    '%%EOF'
  ].join('\n')
}
