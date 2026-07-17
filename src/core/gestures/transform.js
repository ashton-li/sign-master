export function getTouchMetrics(touches) {
  if (!touches || touches.length < 2) return { distance: 0, angle: 0 }
  const x1 = touches[0].clientX ?? touches[0].x ?? 0
  const y1 = touches[0].clientY ?? touches[0].y ?? 0
  const x2 = touches[1].clientX ?? touches[1].x ?? 0
  const y2 = touches[1].clientY ?? touches[1].y ?? 0
  return {
    distance: Math.hypot(x2 - x1, y2 - y1),
    angle: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
  }
}

export function calculatePinchTransform(origin, startMetrics, currentMetrics) {
  const ratio = Math.max(0.35, Math.min(3.5, currentMetrics.distance / Math.max(1, startMetrics.distance)))
  return {
    width: Math.max(54, origin.width * ratio),
    height: Math.max(24, origin.height * ratio),
    rotation: origin.rotation + currentMetrics.angle - startMetrics.angle
  }
}

export function snapLayerToGuides(position, layer, surface, threshold = 8) {
  let x = Math.max(0, Math.min(surface.width - layer.width, position.x))
  let y = Math.max(0, Math.min(surface.height - layer.height, position.y))
  const guideX = Math.abs(x + layer.width / 2 - surface.width / 2) < threshold
  const guideY = Math.abs(y + layer.height / 2 - surface.height / 2) < threshold
  if (guideX) x = surface.width / 2 - layer.width / 2
  if (guideY) y = surface.height / 2 - layer.height / 2
  return { x, y, guideX, guideY }
}

export function calculateContainRect(containerWidth, containerHeight, contentWidth, contentHeight) {
  const safeContentWidth = Math.max(1, Number(contentWidth) || 1)
  const safeContentHeight = Math.max(1, Number(contentHeight) || 1)
  if (!containerWidth || !containerHeight) return { left: 0, top: 0, width: containerWidth || 1, height: containerHeight || 1 }
  const scale = Math.min(containerWidth / safeContentWidth, containerHeight / safeContentHeight)
  const width = safeContentWidth * scale
  const height = safeContentHeight * scale
  return { left: (containerWidth - width) / 2, top: (containerHeight - height) / 2, width, height }
}
