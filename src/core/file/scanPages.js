export function moveScanPage(pages, fromIndex, toIndex) {
  const source = Array.isArray(pages) ? [...pages] : []
  const from = Math.max(0, Math.min(source.length - 1, Number(fromIndex)))
  const to = Math.max(0, Math.min(source.length - 1, Number(toIndex)))
  if (!source.length || from === to) return source
  const [page] = source.splice(from, 1)
  source.splice(to, 0, page)
  return source
}
