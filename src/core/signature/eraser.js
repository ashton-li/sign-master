function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

function createEraserIndex(points, radius) {
  const cellSize = Math.max(16, radius * 1.5)
  const cells = new Map()
  const segments = points.length === 1
    ? [{ start: points[0], end: points[0] }]
    : points.slice(1).map((end, index) => ({ start: points[index], end }))

  segments.forEach((segment, index) => {
    const minX = Math.floor((Math.min(segment.start.x, segment.end.x) - radius) / cellSize)
    const maxX = Math.floor((Math.max(segment.start.x, segment.end.x) + radius) / cellSize)
    const minY = Math.floor((Math.min(segment.start.y, segment.end.y) - radius) / cellSize)
    const maxY = Math.floor((Math.max(segment.start.y, segment.end.y) + radius) / cellSize)
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`
        const entries = cells.get(key) || []
        entries.push(index)
        cells.set(key, entries)
      }
    }
  })

  return {
    candidates(point) {
      const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
      return (cells.get(key) || []).map((index) => segments[index])
    }
  }
}

export function eraseStrokes(strokes, eraserPoints, radius = 14) {
  if (!eraserPoints?.length) return strokes
  const maxStrokeWidth = Math.max(0, ...strokes.map((stroke) => Number(stroke.width || 0)))
  const index = createEraserIndex(eraserPoints, radius + maxStrokeWidth / 2)
  const result = []
  strokes.forEach((stroke) => {
    const effectiveRadius = radius + Number(stroke.width || 0) / 2
    let segment = []
    stroke.points.forEach((point) => {
      const erased = index.candidates(point).some((eraserSegment) => distanceToSegment(point, eraserSegment.start, eraserSegment.end) <= effectiveRadius)
      if (erased) {
        if (segment.length > 1) result.push({ ...stroke, points: segment })
        segment = []
      } else {
        segment.push(point)
      }
    })
    if (segment.length > 1) result.push({ ...stroke, points: segment })
  })
  return result
}
