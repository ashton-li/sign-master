<template>
  <view class="step-wrap">
    <view class="step-row">
      <template v-for="(step, index) in steps" :key="step.key">
        <view :class="['step-circle', stepStatus(index)]">
          <text>{{ index < current ? '✓' : index + 1 }}</text>
        </view>
        <view v-if="index < steps.length - 1" :class="['step-line', index < current ? 'done' : 'pending']" />
      </template>
    </view>
    <view class="label-row">
      <text v-for="step in steps" :key="step.key">{{ step.label }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({
  current: {
    type: Number,
    default: 0
  }
})

const steps = [
  { key: 'file', label: '选择文件' },
  { key: 'detect', label: '识别位置' },
  { key: 'draw', label: '手写签名' },
  { key: 'finish', label: '完成' }
]

function stepStatus(index) {
  if (index < props.current) return 'done'
  if (index === props.current) return 'active'
  return 'pending'
}
</script>

<style scoped>
.step-wrap {
  padding: 4px 2px 11px;
}

.step-row {
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.step-circle.active,
.step-circle.done {
  color: #ffffff;
  background: var(--color-brand);
  box-shadow: 0 8px 18px rgba(88, 86, 224, 0.34);
}

.step-circle.pending {
  color: #a9adbb;
  background: rgba(144, 147, 165, 0.16);
}

.step-line {
  width: 38px;
  height: 2px;
  border-radius: 999px;
}

.step-line.done {
  background: #1ec86f;
}

.step-line.pending {
  background: rgba(144, 147, 165, 0.18);
}

.label-row {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--color-tertiary);
  font-size: 9px;
  font-weight: 700;
}
</style>
