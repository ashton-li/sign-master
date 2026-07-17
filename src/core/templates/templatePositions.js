export function resolveTemplatePositions(slots = [], layers = []) {
  const layerBySlot = new Map(layers.map((layer) => [layer.slotId, layer]))
  return slots.map((slot) => {
    const layer = layerBySlot.get(slot.id)
    if (!layer) return { ...slot }
    return {
      ...slot,
      x: layer.x / 330,
      y: layer.y / 500,
      width: layer.width / 330,
      height: layer.height / 500,
      page: layer.page || slot.page || 1,
      rotation: layer.rotation || 0,
      opacity: layer.opacity ?? 1
    }
  })
}
