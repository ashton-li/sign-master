const DEFAULT_PRESSURE = 0.5

function round(value, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0))
}

export function normalizePoint(point) {
  return {
    x: Number(point.x || 0),
    y: Number(point.y || 0),
    pressure: Number.isFinite(point.pressure) ? Math.max(0, Math.min(1, point.pressure)) : DEFAULT_PRESSURE,
    t: Number.isFinite(point.t) ? point.t : Date.now()
  }
}

export function smoothPoints(points, minDistance = 2) {
  const normalized = points.map(normalizePoint)
  if (normalized.length <= 1) return normalized

  return normalized.reduce((result, point) => {
    const last = result[result.length - 1]
    if (!last || distance(last, point) >= minDistance) {
      result.push(point)
    }
    return result
  }, [])
}

export function getStrokeWidth(prevPoint, nextPoint, baseWidth = 5) {
  const prev = normalizePoint(prevPoint)
  const next = normalizePoint(nextPoint)
  const elapsed = Math.max(1, next.t - prev.t)
  const velocity = distance(prev, next) / elapsed
  const pressureBoost = 0.65 + next.pressure * 0.7
  const velocityFactor = 1 / (1 + velocity * 3.2)
  const dynamicWidth = baseWidth * pressureBoost * (0.48 + velocityFactor)
  return Math.max(baseWidth * 0.58, round(dynamicWidth, 2))
}

export function buildSvgPath(points) {
  const sampled = smoothPoints(points, 0)
  if (sampled.length === 0) return ''
  if (sampled.length === 1) return `M ${round(sampled[0].x)} ${round(sampled[0].y)}`

  const [first, ...rest] = sampled
  const commands = [`M ${round(first.x)} ${round(first.y)}`]

  for (let index = 0; index < rest.length - 1; index += 1) {
    const current = rest[index]
    const next = rest[index + 1]
    const midX = round((current.x + next.x) / 2)
    const midY = round((current.y + next.y) / 2)
    commands.push(`Q ${round(current.x)} ${round(current.y)} ${midX} ${midY}`)
  }

  const last = sampled[sampled.length - 1]
  commands.push(`L ${round(last.x)} ${round(last.y)}`)
  return commands.join(' ')
}

export function createSignatureSnapshot(points, options = {}) {
  const sampled = smoothPoints(points, options.minDistance ?? 2)
  return {
    points: sampled,
    path: buildSvgPath(sampled),
    width: options.width || 720,
    height: options.height || 300,
    color: options.color || '#1a1c26',
    strokeWidth: options.strokeWidth || 4,
    createdAt: options.createdAt || Date.now()
  }
}

export function createSignatureSnapshotFromStrokes(strokes, options = {}) {
  const normalizedStrokes = (strokes || [])
    .map((stroke) => ({
      color: stroke.color || options.color || '#1a1c26',
      width: Number(stroke.width || options.strokeWidth || 4),
      points: smoothPoints(stroke.points || [], options.minDistance ?? 1.5).map((point) => {
        const source = (stroke.points || []).find((item) => item.x === point.x && item.y === point.y)
        return source?.width ? { ...point, width: source.width } : point
      })
    }))
    .filter((stroke) => stroke.points.length > 0)
  const points = normalizedStrokes.flatMap((stroke) => stroke.points)
  const snapshot = createSignatureSnapshot(points, options)
  return { ...snapshot, strokes: normalizedStrokes, pngPath: options.pngPath || '' }
}
