import { getStrokeWidth } from './path'

function applyStyle(ctx, stroke, width = stroke.width) {
  ctx.setStrokeStyle(stroke.color)
  ctx.setLineWidth(width)
  ctx.setLineCap('round')
  ctx.setLineJoin('round')
}

function queueSegment(ctx, stroke, from, to) {
  const width = to.width || getStrokeWidth(from, to, stroke.width)
  to.width = width
  applyStyle(ctx, stroke, width)
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
}

function queueStroke(ctx, stroke) {
  if (!stroke?.points?.length) return
  if (stroke.points.length === 1) return
  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1]
    const current = stroke.points[index]
    applyStyle(ctx, stroke, current.width || stroke.width)
    ctx.beginPath()
    ctx.moveTo(previous.x, previous.y)
    const next = stroke.points[index + 1]
    if (next) ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
    else ctx.lineTo(current.x, current.y)
    ctx.stroke()
  }
}

export function createIncrementalSignatureRenderer(ctx, options = {}) {
  const width = options.width || 900
  const height = options.height || 500
  let currentStroke = null
  let lastPoint = null

  function startStroke(point, style = {}) {
    currentStroke = {
      color: style.color || '#1a1c26',
      width: style.width || 4,
      points: [point]
    }
    lastPoint = point
    return currentStroke
  }

  function addPoint(point) {
    return addPoints([point])
  }

  function addPoints(points = []) {
    if (!currentStroke || !lastPoint) return null
    points.forEach((point) => {
      currentStroke.points.push(point)
      queueSegment(ctx, currentStroke, lastPoint, point)
      lastPoint = point
    })
    if (points.length) ctx.draw(true)
    return currentStroke
  }

  function endStroke() {
    const finished = currentStroke
    currentStroke = null
    lastPoint = null
    return finished
  }

  function redraw(strokes = []) {
    ctx.clearRect(0, 0, width, height)
    strokes.forEach((stroke) => queueStroke(ctx, stroke))
    ctx.draw(false)
  }

  return {
    startStroke,
    addPoint,
    addPoints,
    endStroke,
    redraw
  }
}
