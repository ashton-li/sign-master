<template>
  <canvas
    :id="canvasId"
    :canvas-id="canvasId"
    class="signature-ink"
    :style="fluid ? { width: '100%', height: '100%' } : { width: `${width}px`, height: `${height}px` }"
    :width="width"
    :height="height"
  />
</template>

<script setup>
import { getCurrentInstance, nextTick, onMounted, watch } from 'vue'

const props = defineProps({
  canvasId: { type: String, required: true },
  snapshot: { type: Object, default: null },
  width: { type: Number, default: 120 },
  height: { type: Number, default: 44 },
  fluid: { type: Boolean, default: false }
})

const instance = getCurrentInstance()

function render() {
  const ctx = uni.createCanvasContext(props.canvasId, instance?.proxy)
  ctx.clearRect(0, 0, props.width, props.height)
  const snapshot = props.snapshot
  if (!snapshot?.strokes?.length) {
    ctx.draw(false)
    return
  }
  const scaleX = props.width / (snapshot.width || props.width)
  const scaleY = props.height / (snapshot.height || props.height)
  ctx.save()
  ctx.scale(scaleX, scaleY)
  snapshot.strokes.forEach((stroke) => {
    if (!stroke.points?.length) return
    ctx.setStrokeStyle(stroke.color || snapshot.color || '#1a1c26')
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    for (let index = 1; index < stroke.points.length; index += 1) {
      ctx.setLineWidth(stroke.points[index].width || stroke.width || snapshot.strokeWidth || 4)
      ctx.beginPath()
      ctx.moveTo(stroke.points[index - 1].x, stroke.points[index - 1].y)
      const point = stroke.points[index]
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
  })
  ctx.restore()
  ctx.draw(false)
}

onMounted(() => nextTick(render))
watch(() => [props.snapshot, props.width, props.height], () => nextTick(render), { deep: true })
</script>

<style scoped>
.signature-ink { display: block; }
</style>
