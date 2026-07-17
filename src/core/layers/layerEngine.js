const DEFAULT_LAYER = {
  type: 'signature',
  x: 0,
  y: 0,
  width: 120,
  height: 40,
  scale: 1,
  rotation: 0,
  opacity: 1,
  locked: false,
  visible: true,
  blendMode: 'source-over'
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function unionRect(a, b) {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  }
}

export function createLayer(input = {}) {
  return {
    ...DEFAULT_LAYER,
    id: input.id || `layer-${Date.now()}`,
    ...input
  }
}

export function getLayerBounds(layer) {
  const scale = layer.scale || 1
  const width = layer.width * scale
  const height = layer.height * scale
  const radians = ((layer.rotation || 0) * Math.PI) / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const rotatedWidth = width * cos + height * sin
  const rotatedHeight = width * sin + height * cos
  const dx = (rotatedWidth - width) / 2
  const dy = (rotatedHeight - height) / 2

  return {
    x: Math.floor(layer.x - dx),
    y: Math.floor(layer.y - dy),
    width: Math.ceil(rotatedWidth),
    height: Math.ceil(rotatedHeight)
  }
}

export function createLayerEngine(initialLayers = []) {
  let layers = initialLayers.map(createLayer)
  let dirtyRects = layers.map(getLayerBounds)
  const undoStack = []
  const redoStack = []

  function snapshot() {
    undoStack.push(clone(layers))
    redoStack.length = 0
  }

  function restore(nextLayers) {
    layers = clone(nextLayers)
    dirtyRects = layers.map(getLayerBounds)
  }

  return {
    addLayer(layer) {
      snapshot()
      const next = createLayer(layer)
      layers.push(next)
      dirtyRects.push(getLayerBounds(next))
      return next
    },
    updateLayer(id, patch) {
      const index = layers.findIndex((layer) => layer.id === id)
      if (index === -1) return null
      snapshot()
      const beforeBounds = getLayerBounds(layers[index])
      layers[index] = createLayer({ ...layers[index], ...patch, id })
      const afterBounds = getLayerBounds(layers[index])
      dirtyRects.push(unionRect(beforeBounds, afterBounds))
      return layers[index]
    },
    removeLayer(id) {
      const index = layers.findIndex((layer) => layer.id === id)
      if (index === -1) return null
      snapshot()
      const [removed] = layers.splice(index, 1)
      dirtyRects.push(getLayerBounds(removed))
      return removed
    },
    moveLayer(id, direction) {
      const index = layers.findIndex((layer) => layer.id === id)
      const nextIndex = direction === 'up' ? index + 1 : index - 1
      if (index < 0 || nextIndex < 0 || nextIndex >= layers.length) return layers
      snapshot()
      const [layer] = layers.splice(index, 1)
      layers.splice(nextIndex, 0, layer)
      dirtyRects.push(getLayerBounds(layer))
      return layers
    },
    getLayer(id) {
      return layers.find((layer) => layer.id === id) || null
    },
    getLayers() {
      return clone(layers)
    },
    getDirtyRects() {
      return clone(dirtyRects)
    },
    clearDirty() {
      dirtyRects = []
    },
    undo() {
      if (undoStack.length === 0) return layers
      redoStack.push(clone(layers))
      restore(undoStack.pop())
      return layers
    },
    redo() {
      if (redoStack.length === 0) return layers
      undoStack.push(clone(layers))
      restore(redoStack.pop())
      return layers
    }
  }
}
