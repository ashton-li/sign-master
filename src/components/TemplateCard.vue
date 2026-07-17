<template>
  <view :class="['template-card', { gallery }]" @click="handleClick">
    <view class="template-preview" :class="`tone-${template.tone || 'purple'}`">
      <view class="template-paper">
        <view class="paper-heading"><view /><view /></view>
        <view class="paper-lines"><view v-for="line in 7" :key="line" class="paper-line" :class="{ short:line % 3 === 0 }" /></view>
        <view class="paper-footer"><view /><view /><view /></view>
      </view>
      <view v-for="(slot, index) in template.positions" :key="slot.id || slot.label" class="slot-marker" :style="slotStyle(slot, index)"><text>{{ slot.label || `签字位${index + 1}` }}</text></view>
    </view>
    <view class="template-body"><text class="template-name">{{ template.name }}</text><text class="template-meta">{{ template.slots }} 个签字位</text></view>
  </view>
</template>

<script setup>
const props = defineProps({ template: { type:Object, required:true }, gallery: { type:Boolean, default:false } })
const emit = defineEmits(['click'])

function slotStyle(slot, index) {
  const ratio = (value) => Number(value) <= 1 ? Number(value) * 100 : Number(value)
  const colors = ['#5856e0', '#087f68', '#dc5f1d', '#b62f68', '#2670b8']
  const left = Math.min(76, Math.max(2, ratio(slot.x)))
  const top = Math.min(78, Math.max(5, ratio(slot.y)))
  const width = Math.max(22, Math.min(96 - left, ratio(slot.width)))
  const color = colors[index % colors.length]
  return { left:`${left}%`, top:`${top}%`, width:`${width}%`, height:`${Math.max(16, ratio(slot.height))}%`, color, borderColor:color, backgroundColor:`${color}1f` }
}

function handleClick() { emit('click', props.template) }
</script>

<style scoped>
.template-card{width:100%;padding:8px;border:1px solid rgba(88,86,224,.1);border-radius:8px}.template-preview{position:relative;height:118px;overflow:hidden;border:1px solid #dfe3eb;border-radius:6px;background:#e9ecf3}.template-paper{position:absolute;inset:7px 16px 7px 16px;border:1px solid #d9dde6;border-radius:2px;background:#fff;box-shadow:0 3px 8px rgba(32,36,48,.1)}.paper-heading{display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:8px}.paper-heading view{width:45%;height:4px;border-radius:2px;background:#454b58}.paper-heading view:last-child{width:60%;height:3px;background:#737987}.paper-lines{position:absolute;right:10px;top:27px;left:10px;display:flex;flex-direction:column;gap:6px}.paper-line{height:2px;border-radius:2px;background:#d7dae2}.paper-line.short{width:72%}.paper-footer{position:absolute;right:9px;bottom:8px;left:9px;display:grid;grid-template-columns:1fr 1fr;gap:5px 8px}.paper-footer view{height:2px;background:#aeb4c0}.paper-footer view:first-child{grid-column:1/-1}.slot-marker{position:absolute;z-index:3;display:flex;box-sizing:border-box;min-width:34px;min-height:18px;align-items:center;justify-content:center;overflow:hidden;font-size:7px;font-weight:900;border:2px solid;border-radius:4px;box-shadow:0 2px 5px rgba(30,34,48,.08)}.slot-marker text{max-width:100%;overflow:hidden;padding:1px 3px;text-overflow:ellipsis;white-space:nowrap;background:rgba(255,255,255,.9)}.template-body{display:flex;min-width:0;flex-direction:column;padding:9px 3px 3px}.template-name{overflow:hidden;color:var(--color-ink);font-size:12px;font-weight:900;line-height:16px;text-overflow:ellipsis;white-space:nowrap}.template-meta{margin-top:4px;color:var(--color-tertiary);font-size:9px;font-weight:700}.template-card.gallery{position:relative;height:184px;padding:0;overflow:hidden;border-color:rgba(88,86,224,.12);background:#eef0f6}.gallery .template-preview{position:absolute;inset:0 0 58px;height:auto;border:0;border-radius:0}.gallery .template-paper{inset:8px 24px}.gallery .template-body{position:absolute;right:0;bottom:0;left:0;z-index:5;box-sizing:border-box;height:58px;justify-content:center;padding:7px 9px;border-top:1px solid rgba(255,255,255,.68);background:rgba(255,255,255,.9)}.gallery .template-name{font-size:12px;line-height:16px}.gallery .template-meta{margin-top:4px;font-size:8px}
.template-card{box-sizing:border-box;overflow:hidden;background:rgba(255,255,255,.82);box-shadow:0 8px 22px rgba(34,39,58,.08);transition:transform .12s ease}.template-card:active{transform:scale(.975)}
</style>
