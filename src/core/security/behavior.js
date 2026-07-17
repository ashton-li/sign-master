const VECTOR_POINTS = 32

function flattenStrokes(snapshot) {
  return (snapshot?.strokes || []).flatMap((stroke, strokeIndex) => (stroke.points || []).map((point) => ({ ...point, strokeIndex })))
}

function distance(a, b) {
  return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0))
}

function resample(points, count) {
  if (!points.length) return []
  if (points.length === 1) return Array.from({ length: count }, () => ({ ...points[0] }))
  const distances = [0]
  for (let index = 1; index < points.length; index += 1) distances.push(distances[index - 1] + distance(points[index - 1], points[index]))
  const total = distances.at(-1) || 1
  return Array.from({ length: count }, (_, sampleIndex) => {
    const target = total * sampleIndex / Math.max(1, count - 1)
    let right = distances.findIndex((value) => value >= target)
    if (right <= 0) return { ...points[0] }
    if (right < 0) return { ...points.at(-1) }
    const left = right - 1
    const span = Math.max(0.0001, distances[right] - distances[left])
    const ratio = (target - distances[left]) / span
    const a = points[left]
    const b = points[right]
    return {
      x: a.x + (b.x - a.x) * ratio,
      y: a.y + (b.y - a.y) * ratio,
      pressure: (a.pressure ?? .5) + ((b.pressure ?? .5) - (a.pressure ?? .5)) * ratio,
      t: (a.t || 0) + ((b.t || 0) - (a.t || 0)) * ratio
    }
  })
}

function round(value, digits = 5) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function extractBehaviorProfile(snapshot) {
  const points = flattenStrokes(snapshot)
  if (points.length < 2) return { version: 1, vector: [], sampleCount: points.length, strokeCount: snapshot?.strokes?.length || 0, duration: 0 }
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const firstTime = points[0].t || 0
  const duration = Math.max(1, (points.at(-1).t || firstTime) - firstTime)
  const samples = resample(points, VECTOR_POINTS)
  const vector = []
  samples.forEach((point, index) => {
    const previous = samples[Math.max(0, index - 1)]
    const elapsed = Math.max(1, (point.t || 0) - (previous.t || 0))
    const normalizedDistance = Math.hypot((point.x - previous.x) / width, (point.y - previous.y) / height)
    vector.push(round((point.x - minX) / width), round((point.y - minY) / height), round(point.pressure ?? .5), round(Math.min(1, normalizedDistance / elapsed * duration / 4)))
  })
  return {
    version: 1,
    vector,
    sampleCount: points.length,
    strokeCount: snapshot.strokes?.length || 0,
    duration,
    aspectRatio: round(width / height),
    pathLength: round(points.slice(1).reduce((sum, point, index) => sum + distance(points[index], point), 0))
  }
}

export function compareBehaviorProfiles(reference, candidate) {
  if (!reference?.vector?.length || reference.vector.length !== candidate?.vector?.length) return { score: 0, verdict: '无法鉴别', shapeScore: 0, rhythmScore: 0 }
  const meanSquareError = reference.vector.reduce((sum, value, index) => sum + (value - candidate.vector[index]) ** 2, 0) / reference.vector.length
  const shapeScore = Math.max(0, Math.min(1, Math.exp(-4.2 * Math.sqrt(meanSquareError))))
  const durationRatio = Math.min(reference.duration, candidate.duration) / Math.max(1, reference.duration, candidate.duration)
  const strokeRatio = Math.min(reference.strokeCount, candidate.strokeCount) / Math.max(1, reference.strokeCount, candidate.strokeCount)
  const aspectRatio = Math.min(reference.aspectRatio || 1, candidate.aspectRatio || 1) / Math.max(reference.aspectRatio || 1, candidate.aspectRatio || 1)
  const rhythmScore = durationRatio * .55 + strokeRatio * .3 + aspectRatio * .15
  const score = Math.round((shapeScore * .72 + rhythmScore * .28) * 100)
  const verdict = score >= 78 ? '高度一致' : score >= 58 ? '存在相似特征' : '差异明显'
  return { score, verdict, shapeScore: Math.round(shapeScore * 100), rhythmScore: Math.round(rhythmScore * 100) }
}
