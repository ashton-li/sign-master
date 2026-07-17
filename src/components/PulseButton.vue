<template>
  <button class="pulse-btn" @click="handleClick">
    <slot />
  </button>
</template>

<script setup>
const emit = defineEmits(['click'])

function handleClick(event) {
  emit('click', event)
}
</script>
