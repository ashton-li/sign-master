<template>
  <view :class="classes" @click="handleClick">
    <slot />
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  neon: {
    type: Boolean,
    default: false
  },
  pressable: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['click'])

const classes = computed(() => [
  'glass-card',
  props.neon ? 'neon-active' : '',
  props.pressable ? 'is-pressable' : ''
])

function handleClick(event) {
  emit('click', event)
}
</script>
